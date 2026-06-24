from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
import asyncio
import os
from datetime import datetime
from typing import List, Optional

from app.core.database import get_db
from app.models.auth import Usuario
from app.models.devices import AreaHospital, Dispositivo, Traslado
from app.models.inventory import ConfiguracionSistema, ColaCorreosOutbox
from app.models.incidents import Orden
from app.schemas.devices import (
    AreaHospitalResponse, AreaHospitalCreate,
    DispositivoResponse, DispositivoCreate, DispositivoUpdate,
    TrasladoCreate, TrasladoResponse
)
from app.routers.auth import get_current_user, require_roles

router = APIRouter(prefix="/api/v1/devices", tags=["devices"])

async def ping_ip(ip: str) -> bool:
    """
    Ejecuta un ping asíncrono y de corta espera a una dirección IP fija.
    Devuelve True si responde, False en caso contrario.
    """
    # En Windows usamos -n 1, en Unix/Alpine docker usamos -c 1.
    # Para ser resilientes ante ambos entornos, comprobamos el SO o simplemente usamos comandos de red
    # intentando con timeout de 1000 ms.
    is_windows = os.name == 'nt' if 'os' in globals() else True
    
    # Comprobar si estamos ejecutando en Windows
    import platform
    cmd = ["ping", "-n" if platform.system().lower() == 'windows' else "-c", "1", "-w", "1000", ip]
    
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        await proc.communicate()
        return proc.returncode == 0
    except Exception:
        return False


# --- ENDPOINTS DE ÁREAS ---

@router.get("/areas", response_model=List[AreaHospitalResponse])
async def get_areas(
    current_user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Lista todas las áreas hospitalarias indexadas.
    """
    query = select(AreaHospital).order_by(AreaHospital.nombre.asc())
    res = await db.execute(query)
    return res.scalars().all()

@router.post("/areas", response_model=AreaHospitalResponse)
async def create_area(
    payload: AreaHospitalCreate,
    current_user: Usuario = Depends(require_roles(["Admin"])),
    db: AsyncSession = Depends(get_db)
):
    """
    Registra una nueva área hospitalaria (Acceso exclusivo del Admin).
    """
    area = AreaHospital(nombre=payload.nombre, descripcion=payload.descripcion)
    db.add(area)
    await db.commit()
    await db.refresh(area)
    return area

@router.put("/areas/{id}", response_model=AreaHospitalResponse)
async def update_area(
    id: int,
    payload: AreaHospitalCreate,
    current_user: Usuario = Depends(require_roles(["Admin"])),
    db: AsyncSession = Depends(get_db)
):
    """
    Edita los datos de una dependencia física (Acceso exclusivo del Admin).
    """
    query = select(AreaHospital).where(AreaHospital.id == id)
    res = await db.execute(query)
    area = res.scalars().first()

    if not area:
        raise HTTPException(status_code=404, detail="Área no encontrada.")

    area.nombre = payload.nombre
    area.descripcion = payload.descripcion
    await db.commit()
    await db.refresh(area)
    return area


# --- ENDPOINTS DE DISPOSITIVOS ---

@router.get("", response_model=List[DispositivoResponse])
async def get_devices(
    current_user: Usuario = Depends(require_roles(["Admin", "Soporte Técnico", "Técnico Hardware", "Técnico Software"])),
    db: AsyncSession = Depends(get_db)
):
    """
    Obtiene el listado completo del inventario informático del taller.
    """
    query = select(Dispositivo).order_by(Dispositivo.codigo_activo.asc())
    res = await db.execute(query)
    devices = res.scalars().all()
    
    # Cargar área asociada
    for dev in devices:
        query_area = select(AreaHospital).where(AreaHospital.id == dev.area_id)
        res_area = await db.execute(query_area)
        dev.area = res_area.scalars().first()

    return devices

@router.post("", response_model=DispositivoResponse)
async def create_device(
    payload: DispositivoCreate,
    current_user: Usuario = Depends(require_roles(["Admin", "Soporte Técnico"])),
    db: AsyncSession = Depends(get_db)
):
    """
    Registra un activo tecnológico vinculándolo a un área específica.
    """
    device = Dispositivo(
        codigo_activo=payload.codigo_activo,
        serial=payload.serial,
        mac_address=payload.mac_address,
        ip_fija=payload.ip_fija,
        marca=payload.marca,
        area_id=payload.area_id,
        descripcion=payload.descripcion,
        estado_patrimonial=payload.estado_patrimonial
    )
    db.add(device)
    await db.commit()
    await db.refresh(device)
    return device


@router.get("/stats")
async def get_devices_stats(
    current_user: Usuario = Depends(require_roles(["Admin", "Soporte Técnico", "Técnico Hardware", "Técnico Software"])),
    db: AsyncSession = Depends(get_db)
):
    """
    Calcula los totalizadores de dispositivos: totales, activos, averiados y en línea.
    """
    from sqlalchemy import func
    
    # Totales
    total_q = select(func.count(Dispositivo.id))
    res_tot = await db.execute(total_q)
    total_devices = res_tot.scalar() or 0

    # Activos
    activos_q = select(func.count(Dispositivo.id)).where(Dispositivo.estado_patrimonial == "Activo")
    res_act = await db.execute(activos_q)
    activos_devices = res_act.scalar() or 0

    # Averiados
    averiados_q = select(func.count(Dispositivo.id)).where(Dispositivo.estado_patrimonial == "Averiado")
    res_ave = await db.execute(averiados_q)
    averiados_devices = res_ave.scalar() or 0

    # En Línea (Ping en paralelo para activos con IP)
    query_ips = select(Dispositivo).where(
        Dispositivo.estado_patrimonial == "Activo",
        Dispositivo.ip_fija != None,
        Dispositivo.ip_fija != ""
    )
    res_ips = await db.execute(query_ips)
    devices_with_ip = res_ips.scalars().all()

    en_linea_count = 0
    if devices_with_ip:
        tasks = [ping_ip(d.ip_fija) for d in devices_with_ip]
        ping_results = await asyncio.gather(*tasks)
        en_linea_count = sum(1 for r in ping_results if r)

    return {
        "totales": total_devices,
        "activos": activos_devices,
        "averiados": averiados_devices,
        "en_linea": en_linea_count
    }


@router.get("/{id}", response_model=DispositivoResponse)
async def get_device_by_id(
    id: int,
    current_user: Usuario = Depends(require_roles(["Admin", "Soporte Técnico", "Técnico Hardware", "Técnico Software"])),
    db: AsyncSession = Depends(get_db)
):
    """
    Retorna el expediente técnico de un equipo de computación.
    Carga de forma implícita el histórico de traslados.
    """
    query = select(Dispositivo).where(Dispositivo.id == id)
    res = await db.execute(query)
    device = res.scalars().first()

    if not device:
        raise HTTPException(status_code=404, detail="Dispositivo no encontrado.")

    # Cargar área
    query_area = select(AreaHospital).where(AreaHospital.id == device.area_id)
    res_area = await db.execute(query_area)
    device.area = res_area.scalars().first()

    return device

@router.get("/{id}/ping")
async def ping_device_connection(
    id: int,
    current_user: Usuario = Depends(require_roles(["Admin", "Soporte Técnico", "Técnico Hardware", "Técnico Software"])),
    db: AsyncSession = Depends(get_db)
):
    """
    Realiza una prueba ICMP (Ping) bajo demanda al equipo seleccionado.
    """
    query = select(Dispositivo.ip_fija).where(Dispositivo.id == id)
    res = await db.execute(query)
    ip_fija = res.scalars().first()

    if not ip_fija:
        return {"status": "offline", "message": "El activo no posee configurada ninguna dirección IP fija para chequeos de red."}

    online = await ping_ip(ip_fija)
    return {
        "status": "online" if online else "offline",
        "ip": ip_fija,
        "message": f"Conexión con el activo informático establecida con éxito." if online else "Tiempo de espera agotado. El activo se encuentra inaccesible en la LAN."
    }

@router.post("/{id}/relocate")
async def relocate_device(
    id: int,
    payload: TrasladoCreate,
    current_user: Usuario = Depends(require_roles(["Admin"])),
    db: AsyncSession = Depends(get_db)
):
    """
    Traslada un dispositivo de área. Registra la auditoría y encola un acta de traslado
    institucional bajo el patrón Outbox.
    """
    # Buscar dispositivo
    dev_query = select(Dispositivo).where(Dispositivo.id == id)
    dev_res = await db.execute(dev_query)
    device = dev_res.scalars().first()

    if not device:
        raise HTTPException(status_code=404, detail="Dispositivo no encontrado.")

    if device.area_id == payload.area_destino_id:
        raise HTTPException(status_code=400, detail="El área de destino es idéntica al área de origen.")

    # Validar áreas
    orig_area_query = select(AreaHospital).where(AreaHospital.id == device.area_id)
    orig_res = await db.execute(orig_area_query)
    origen = orig_res.scalars().first()

    dest_area_query = select(AreaHospital).where(AreaHospital.id == payload.area_destino_id)
    dest_res = await db.execute(dest_area_query)
    destino = dest_res.scalars().first()

    if not destino:
        raise HTTPException(status_code=404, detail="El área de destino seleccionada no existe.")

    # Guardar traslado histórico
    origen_id = device.area_id
    device.area_id = payload.area_destino_id

    traslado = Traslado(
        device_id=id,
        area_origen_id=origen_id,
        area_destino_id=payload.area_destino_id,
        motivo_traslado=payload.motivo_traslado,
        ejecutor_id=current_user.id,
        tipo_movimiento="Traslado"
    )
    db.add(traslado)

    # Cargar correo bienes institucional
    conf_query = select(ConfiguracionSistema).where(ConfiguracionSistema.id == 1)
    conf_res = await db.execute(conf_query)
    config = conf_res.scalars().first()
    email_dest = config.correo_bienes_institucional if config else "bienes.patrimonio@hospital.gob"

    # Encolar en Outbox para despacho de acta digital por correo SMTP
    cuerpo = f"""
    <html>
    <body>
        <h2>Acta Oficial de Traslado de Activo Fijo Hospitalario</h2>
        <p>Se notifica a Bienes Nacionales la reubicación de inventario informático:</p>
        <table border="1" cellpadding="5">
            <tr><td><b>Activo / Código:</b></td><td>{device.codigo_activo}</td></tr>
            <tr><td><b>Serial:</b></td><td>{device.serial}</td></tr>
            <tr><td><b>Marca:</b></td><td>{device.marca}</td></tr>
            <tr><td><b>Área Origen:</b></td><td>{origen.nombre if origen else 'Desconocida'}</td></tr>
            <tr><td><b>Área Destino:</b></td><td>{destino.nombre}</td></tr>
            <tr><td><b>Motivo:</b></td><td>{payload.motivo_traslado}</td></tr>
            <tr><td><b>Autorizado Por:</b></td><td>{current_user.nombre} {current_user.apellido}</td></tr>
            <tr><td><b>Fecha:</b></td><td>{datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC</td></tr>
        </table>
    </body>
    </html>
    """

    outbox_email = ColaCorreosOutbox(
        destinatario=email_dest,
        asunto=f"Acta de Traslado de Activo - Código {device.codigo_activo}",
        cuerpo_html=cuerpo,
        procesado=False,
        intentos=0
    )
    db.add(outbox_email)
    await db.commit()

    return {"message": f"Traslado registrado con éxito. Acta patrimonial encolada en Outbox."}

@router.post("/{id}/retire")
async def retire_device(
    id: int,
    motivo: str,
    current_user: Usuario = Depends(require_roles(["Admin"])),
    db: AsyncSession = Depends(get_db)
):
    """
    Desincorpora un dispositivo (Baja Patrimonial).
    Cambia su estado en inventario a 'Desincorporado' de forma lógica y encola el acta de baja.
    """
    query = select(Dispositivo).where(Dispositivo.id == id)
    res = await db.execute(query)
    device = res.scalars().first()

    if not device:
        raise HTTPException(status_code=404, detail="Dispositivo no encontrado.")

    if device.estado_patrimonial == "Desincorporado":
        raise HTTPException(status_code=400, detail="Este dispositivo ya ha sido desincorporado previamente.")

    orig_area_query = select(AreaHospital).where(AreaHospital.id == device.area_id)
    orig_res = await db.execute(orig_area_query)
    origen = orig_res.scalars().first()

    # Desincorporar
    device.estado_patrimonial = "Desincorporado"

    traslado = Traslado(
        device_id=id,
        area_origen_id=device.area_id,
        area_destino_id=device.area_id,
        motivo_traslado=motivo,
        ejecutor_id=current_user.id,
        tipo_movimiento="Baja Patrimonial"
    )
    db.add(traslado)

    # Cargar correo bienes institucional
    conf_query = select(ConfiguracionSistema).where(ConfiguracionSistema.id == 1)
    conf_res = await db.execute(conf_query)
    config = conf_res.scalars().first()
    email_dest = config.correo_bienes_institucional if config else "bienes.patrimonio@hospital.gob"

    # Encolar en Outbox para despacho de acta digital por correo SMTP
    cuerpo = f"""
    <html>
    <body>
        <h2>Acta Oficial de Desincorporación de Activo Fijo (Baja Patrimonial)</h2>
        <p>Se notifica a Bienes Nacionales la baja definitiva del activo del inventario:</p>
        <table border="1" cellpadding="5">
            <tr><td><b>Activo / Código:</b></td><td>{device.codigo_activo}</td></tr>
            <tr><td><b>Serial:</b></td><td>{device.serial}</td></tr>
            <tr><td><b>Marca:</b></td><td>{device.marca}</td></tr>
            <tr><td><b>Área de Custodia:</b></td><td>{origen.nombre if origen else 'Desconocida'}</td></tr>
            <tr><td><b>Motivo de la Baja:</b></td><td>{motivo}</td></tr>
            <tr><td><b>Autorizado Por:</b></td><td>{current_user.nombre} {current_user.apellido}</td></tr>
            <tr><td><b>Fecha:</b></td><td>{datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC</td></tr>
        </table>
    </body>
    </html>
    """

    outbox_email = ColaCorreosOutbox(
        destinatario=email_dest,
        asunto=f"Acta de Baja Patrimonial de Activo - Código {device.codigo_activo}",
        cuerpo_html=cuerpo,
        procesado=False,
        intentos=0
    )
    db.add(outbox_email)
    await db.commit()

    return {"message": "El activo ha sido desincorporado lógicamente del inventario. Acta de baja encolada."}

@router.get("/{id}/traslados", response_model=List[TrasladoResponse])
async def get_device_relocation_history(
    id: int,
    current_user: Usuario = Depends(require_roles(["Admin", "Soporte Técnico"])),
    db: AsyncSession = Depends(get_db)
):
    """
    Obtiene el historial de traslados e intervenciones patrimoniales sufridas por el dispositivo.
    """
    query = select(Traslado).where(Traslado.device_id == id).order_by(Traslado.created_at.desc())
    res = await db.execute(query)
    traslados = res.scalars().all()
    
    # Cargar relaciones origen y destino de cada traslado
    for t in traslados:
        q_origen = select(AreaHospital).where(AreaHospital.id == t.area_origen_id)
        r_origen = await db.execute(q_origen)
        t.area_origen = r_origen.scalars().first()

        q_destino = select(AreaHospital).where(AreaHospital.id == t.area_destino_id)
        r_destino = await db.execute(q_destino)
        t.area_destino = r_destino.scalars().first()

        q_ej = select(Usuario).where(Usuario.id == t.ejecutor_id)
        r_ej = await db.execute(q_ej)
        t.ejecutor = r_ej.scalars().first()

    return traslados


@router.put("/{id}", response_model=DispositivoResponse)
async def update_device(
    id: int,
    payload: DispositivoUpdate,
    current_user: Usuario = Depends(require_roles(["Admin", "Soporte Técnico"])),
    db: AsyncSession = Depends(get_db)
):
    """
    Edita la IP y la descripción de un activo tecnológico.
    """
    query = select(Dispositivo).where(Dispositivo.id == id)
    res = await db.execute(query)
    device = res.scalars().first()

    if not device:
        raise HTTPException(status_code=404, detail="Dispositivo no encontrado.")

    # Guardar cambios
    device.ip_fija = payload.ip_fija
    device.descripcion = payload.descripcion
    await db.commit()
    await db.refresh(device)

    # Cargar área asociada
    query_area = select(AreaHospital).where(AreaHospital.id == device.area_id)
    res_area = await db.execute(query_area)
    device.area = res_area.scalars().first()

    return device


@router.get("/{id}/incidents", response_model=List[dict])
async def get_device_incidents(
    id: int,
    current_user: Usuario = Depends(require_roles(["Admin", "Soporte Técnico", "Técnico Hardware", "Técnico Software"])),
    db: AsyncSession = Depends(get_db)
):
    """
    Obtiene el historial clínico de incidencias y órdenes de servicio asociadas al dispositivo.
    """
    # Verificar que el dispositivo exista
    dev_query = select(Dispositivo).where(Dispositivo.id == id)
    dev_res = await db.execute(dev_query)
    device = dev_res.scalars().first()

    if not device:
        raise HTTPException(status_code=404, detail="Dispositivo no encontrado.")

    # Consultar las órdenes de servicio asociadas
    query = (
        select(Orden)
        .options(
            selectinload(Orden.pre_orden),
            selectinload(Orden.tecnico),
            selectinload(Orden.soporte)
        )
        .where(Orden.device_id == id)
        .order_by(Orden.created_at.desc())
    )
    res = await db.execute(query)
    ordenes = res.scalars().all()

    # Mapear respuesta
    result = []
    for o in ordenes:
        result.append({
            "id": o.id,
            "estado": o.estado,
            "created_at": o.created_at,
            "closed_at": o.closed_at,
            "diagnostico": o.diagnostico or "Sin diagnóstico aún",
            "urgencia": o.pre_orden.urgencia if o.pre_orden else "Media",
            "tipo_requerimiento": o.pre_orden.tipo_requerimiento if o.pre_orden else "Falla Hardware/Software",
            "resumen": o.pre_orden.resumen if o.pre_orden else "Sin resumen",
            "tecnico": f"{o.tecnico.nombre} {o.tecnico.apellido}" if o.tecnico else "No Asignado",
            "soporte": f"{o.soporte.nombre} {o.soporte.apellido}" if o.soporte else "Sistema"
        })
    return result
