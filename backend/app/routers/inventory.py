from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, update, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional

from app.core.database import get_db
from app.models.auth import Usuario, Empleado
from app.models.inventory import (
    InventarioItem, PrestamoHerramienta, 
    ConfiguracionSistema, AlertasSistema
)
from app.schemas.inventory import (
    InventarioItemResponse, InventarioItemCreate,
    PrestamoHerramientaResponse, PrestamoHerramientaCreate
)
from app.routers.auth import get_current_user, require_roles
from app.core.websocket import manager

router = APIRouter(prefix="/api/v1/inventory", tags=["inventory"])

# --- ENDPOINTS DE INVENTARIO ---

@router.get("/items", response_model=List[InventarioItemResponse])
async def get_inventory_items(
    current_user: Usuario = Depends(require_roles(["Admin", "Soporte Técnico", "Técnico Hardware", "Técnico Software"])),
    db: AsyncSession = Depends(get_db)
):
    """
    Obtiene todos los materiales y herramientas disponibles en el taller.
    """
    query = select(InventarioItem).order_by(InventarioItem.nombre.asc())
    res = await db.execute(query)
    return res.scalars().all()

@router.post("/items", response_model=InventarioItemResponse)
async def create_inventory_item(
    payload: InventarioItemCreate,
    current_user: Usuario = Depends(require_roles(["Admin", "Soporte Técnico"])),
    db: AsyncSession = Depends(get_db)
):
    """
    Añade un nuevo ítem (Consumible o Herramienta) al catálogo del taller.
    """
    item = InventarioItem(
        nombre=payload.nombre,
        tipo=payload.tipo,
        stock=payload.stock,
        stock_minimo=payload.stock_minimo
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item

@router.put("/items/{id}", response_model=InventarioItemResponse)
async def update_inventory_item(
    id: int,
    stock: int,
    stock_minimo: Optional[int] = None,
    current_user: Usuario = Depends(require_roles(["Admin", "Soporte Técnico"])),
    db: AsyncSession = Depends(get_db)
):
    """
    Actualiza las existencias o el stock mínimo de un material.
    """
    query = select(InventarioItem).where(InventarioItem.id == id)
    res = await db.execute(query)
    item = res.scalars().first()

    if not item:
        raise HTTPException(status_code=404, detail="Material no encontrado.")

    item.stock = stock
    if stock_minimo is not None:
        item.stock_minimo = stock_minimo

    await db.commit()
    await db.refresh(item)
    return item


@router.get("/stats")
async def get_inventory_stats(
    current_user: Usuario = Depends(require_roles(["Admin", "Soporte Técnico", "Técnico Hardware", "Técnico Software"])),
    db: AsyncSession = Depends(get_db)
):
    """
    Obtiene las estadísticas clave del inventario técnico: producto más usado y con más bajo stock.
    """
    from sqlalchemy import func
    
    # 1. Producto con más bajo stock
    query_low = select(InventarioItem).order_by(InventarioItem.stock.asc())
    res_low = await db.execute(query_low)
    low_stock_item = res_low.scalars().first()

    # 2. Consumible más usado en órdenes resueltas
    query_most_used = text("""
        SELECT idep.id, idep.nombre, SUM(oc.cantidad) as total_usado
        FROM orden_consumibles oc
        JOIN ordenes o ON oc.orden_id = o.id
        JOIN inventario_departamento idep ON oc.consumible_id = idep.id
        WHERE o.estado = 'RESUELTA'
        GROUP BY idep.id, idep.nombre
        ORDER BY total_usado DESC
        LIMIT 1
    """)
    res_used = await db.execute(query_most_used)
    used_row = res_used.fetchone()

    most_used_product = None
    if used_row:
        most_used_product = {
            "id": used_row[0],
            "nombre": used_row[1],
            "total_usado": int(used_row[2])
        }
    else:
        # Si no hay consumibles usados en órdenes cerradas, buscar la herramienta más prestada
        query_most_loaned = text("""
            SELECT idep.id, idep.nombre, COUNT(ph.id) as total_prestamos
            FROM prestamos_herramientas ph
            JOIN inventario_departamento idep ON ph.herramienta_id = idep.id
            GROUP BY idep.id, idep.nombre
            ORDER BY total_prestamos DESC
            LIMIT 1
        """)
        res_loaned = await db.execute(query_most_loaned)
        loaned_row = res_loaned.fetchone()
        if loaned_row:
            most_used_product = {
                "id": loaned_row[0],
                "nombre": loaned_row[1],
                "total_usado": int(loaned_row[2]),
                "es_herramienta": True
            }

    return {
        "bajo_stock": {
            "id": low_stock_item.id,
            "nombre": low_stock_item.nombre,
            "stock": low_stock_item.stock,
            "stock_minimo": low_stock_item.stock_minimo,
            "tipo": low_stock_item.tipo
        } if low_stock_item else None,
        "mas_usado": most_used_product
    }


# --- ENDPOINTS DE PRÉSTAMOS ---

@router.get("/prestamos", response_model=List[PrestamoHerramientaResponse])
async def get_active_loans(
    current_user: Usuario = Depends(require_roles(["Admin", "Soporte Técnico", "Técnico Hardware", "Técnico Software"])),
    db: AsyncSession = Depends(get_db)
):
    """
    Lista todos los préstamos registrados en el taller.
    """
    query = select(PrestamoHerramienta).options(selectinload(PrestamoHerramienta.herramienta)).order_by(PrestamoHerramienta.fecha_prestamo.desc())
    res = await db.execute(query)
    loans = res.scalars().all()

    # Formatear la respuesta con datos de relaciones cargados
    formatted_loans = []
    for loan in loans:
        # Forzar carga de relaciones
        query_rel = select(Empleado).where(Empleado.cedula == loan.beneficiario_cedula)
        res_emp = await db.execute(query_rel)
        emp = res_emp.scalars().first()

        query_aut = select(Usuario).where(Usuario.id == loan.autorizador_id)
        res_aut = await db.execute(query_aut)
        aut = res_aut.scalars().first()

        formatted_loans.append({
            "id": loan.id,
            "herramienta_id": loan.herramienta_id,
            "autorizador_id": loan.autorizador_id,
            "beneficiario_cedula": loan.beneficiario_cedula,
            "fecha_prestamo": loan.fecha_prestamo,
            "fecha_devolucion_estimada": loan.fecha_devolucion_estimada,
            "fecha_devolucion_real": loan.fecha_devolucion_real,
            "estado": loan.estado,
            "herramienta": loan.herramienta,
            "autorizador": {
                "id": aut.id,
                "nombre": aut.nombre,
                "apellido": aut.apellido,
                "email": aut.email
            } if aut else {},
            "beneficiario": {
                "cedula": emp.cedula,
                "nombre": emp.nombre,
                "apellido": emp.apellido,
                "estado": emp.estado
            } if emp else {}
        })

    return formatted_loans

@router.post("/prestamos", response_model=PrestamoHerramientaResponse)
async def create_tool_loan(
    payload: PrestamoHerramientaCreate,
    current_user: Usuario = Depends(require_roles(["Admin", "Soporte Técnico"])),
    db: AsyncSession = Depends(get_db)
):
    """
    Registra un préstamo de herramienta mediante estructura dual obligatoria:
    Autorizado por usuario activo del taller y beneficiado por empleado de nómina institucional.
    Descuenta 1 unidad de stock de la herramienta.
    """
    # Validar beneficiario de RRHH
    emp_query = select(Empleado).where(Empleado.cedula == payload.beneficiario_cedula)
    emp_res = await db.execute(emp_query)
    empleado = emp_res.scalars().first()

    if not empleado:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cédula no válida: El beneficiario no pertenece a la nómina del hospital."
        )

    if empleado.estado != "Activo":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Operación bloqueada: El beneficiario se encuentra Inactivo en RRHH."
        )

    # Validar herramienta e inventario
    item_query = select(InventarioItem).where(
        InventarioItem.id == payload.herramienta_id,
        InventarioItem.tipo == "Herramienta"
    )
    item_res = await db.execute(item_query)
    tool = item_res.scalars().first()

    if not tool:
        raise HTTPException(status_code=404, detail="La herramienta no existe en el catálogo.")

    if tool.stock <= 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="La herramienta seleccionada no se encuentra disponible (Stock agotado)."
        )

    # Cargar horas máximas de préstamo
    conf_query = select(ConfiguracionSistema).where(ConfiguracionSistema.id == 1)
    conf_res = await db.execute(conf_query)
    config = conf_res.scalars().first()
    max_hours = config.tiempo_max_prestamo_herramientas if config else 24

    # Registrar préstamo
    estimada = datetime.utcnow() + timedelta(hours=max_hours)
    
    prestamo = PrestamoHerramienta(
        herramienta_id=payload.herramienta_id,
        autorizador_id=current_user.id,
        beneficiario_cedula=payload.beneficiario_cedula,
        fecha_devolucion_estimada=estimada,
        estado="Activo"
    )
    
    # Descontar stock herramienta
    tool.stock = tool.stock - 1

    db.add(prestamo)
    await db.commit()
    await db.refresh(prestamo)

    # Devolver respuesta formateada
    return {
        "id": prestamo.id,
        "herramienta_id": prestamo.herramienta_id,
        "autorizador_id": prestamo.autorizador_id,
        "beneficiario_cedula": prestamo.beneficiario_cedula,
        "fecha_prestamo": prestamo.fecha_prestamo,
        "fecha_devolucion_estimada": prestamo.fecha_devolucion_estimada,
        "fecha_devolucion_real": prestamo.fecha_devolucion_real,
        "estado": prestamo.estado,
        "herramienta": tool,
        "autorizador": {
            "id": current_user.id,
            "nombre": current_user.nombre,
            "apellido": current_user.apellido,
            "email": current_user.email
        },
        "beneficiario": {
            "cedula": empleado.cedula,
            "nombre": empleado.nombre,
            "apellido": empleado.apellido
        }
    }

@router.post("/prestamos/{id}/return")
async def return_tool(
    id: int,
    current_user: Usuario = Depends(require_roles(["Admin", "Soporte Técnico"])),
    db: AsyncSession = Depends(get_db)
):
    """
    Registra el retorno físico de la herramienta al taller, incrementando el stock.
    """
    query = select(PrestamoHerramienta).where(PrestamoHerramienta.id == id)
    res = await db.execute(query)
    loan = res.scalars().first()

    if not loan:
        raise HTTPException(status_code=404, detail="Registro de préstamo no encontrado.")

    if loan.estado != "Activo" and loan.estado != "Retrasado":
        raise HTTPException(status_code=400, detail="Este préstamo ya ha sido cerrado previamente.")

    loan.estado = "Devuelto"
    loan.fecha_devolucion_real = datetime.utcnow()

    # Reintegrar al stock
    tool_query = select(InventarioItem).where(InventarioItem.id == loan.herramienta_id)
    tool_res = await db.execute(tool_query)
    tool = tool_res.scalars().first()
    if tool:
        tool.stock = tool.stock + 1

    await db.commit()
    return {"message": "Herramienta devuelta e inventario actualizado exitosamente."}

@router.post("/prestamos/{id}/report")
async def report_tool_incident(
    id: int,
    nuevo_estado: str, # Dañado, Perdido
    current_user: Usuario = Depends(require_roles(["Admin", "Soporte Técnico"])),
    db: AsyncSession = Depends(get_db)
):
    """
    Registra siniestros de herramientas (Dañada o Perdida).
    No reintegra la herramienta al inventario y genera una alarma directa en la terminal del Admin.
    """
    if nuevo_estado not in ("Dañado", "Perdido"):
        raise HTTPException(status_code=400, detail="Estado de siniestro no válido. Elija Dañado o Perdido.")

    query = select(PrestamoHerramienta).where(PrestamoHerramienta.id == id)
    res = await db.execute(query)
    loan = res.scalars().first()

    if not loan:
        raise HTTPException(status_code=404, detail="Préstamo no encontrado.")

    loan.estado = nuevo_estado
    loan.fecha_devolucion_real = datetime.utcnow()

    # Cargar relaciones
    tool_query = select(InventarioItem).where(InventarioItem.id == loan.herramienta_id)
    tool_res = await db.execute(tool_query)
    tool = tool_res.scalars().first()
    
    emp_query = select(Empleado).where(Empleado.cedula == loan.beneficiario_cedula)
    emp_res = await db.execute(emp_query)
    empleado = emp_res.scalars().first()

    # Crear alerta física en la base de datos para el Administrador
    msg = f"ALERTA: Herramienta '{tool.nombre if tool else 'Desconocida'}' reportada como {nuevo_estado.upper()}. Prestada originalmente a {empleado.nombre} {empleado.apellido} (Cédula: {loan.beneficiario_cedula})."
    
    alerta = AlertasSistema(
        mensaje=msg,
        destinatario_rol="Admin",
        leida=False
    )
    db.add(alerta)
    await db.commit()

    # Despachar notificación WebSocket en tiempo real al Administrador conectado
    ws_payload = {
        "event": "admin_alert",
        "mensaje": msg,
        "created_at": datetime.utcnow().isoformat()
    }
    await manager.broadcast(ws_payload, role="Admin")

    return {"message": f"Siniestro reportado. Alarma enviada a la terminal del administrador."}
