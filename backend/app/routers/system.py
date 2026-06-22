from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Dict, Any

from app.core.database import get_db
from app.models.auth import Usuario
from app.models.inventory import ConfiguracionSistema, AlertasSistema, AuditoriaLog
from app.schemas.inventory import (
    ConfiguracionSistemaResponse, ConfiguracionSistemaUpdate,
    AlertaSistemaResponse, AuditoriaLogResponse
)
from app.routers.auth import get_current_user, require_roles

router = APIRouter(prefix="/api/v1/system", tags=["system"])

# --- CONFIGURACIÓN GLOBAL ---

@router.get("/config", response_model=ConfiguracionSistemaResponse)
async def get_system_config(
    current_user: Usuario = Depends(require_roles(["Admin"])),
    db: AsyncSession = Depends(get_db)
):
    """
    Obtiene la fila única de configuración operacional del hospital.
    """
    query = select(ConfiguracionSistema).where(ConfiguracionSistema.id == 1)
    res = await db.execute(query)
    config = res.scalars().first()

    if not config:
        raise HTTPException(status_code=404, detail="Configuración no encontrada.")
    return config

@router.put("/config", response_model=ConfiguracionSistemaResponse)
async def update_system_config(
    payload: ConfiguracionSistemaUpdate,
    current_user: Usuario = Depends(require_roles(["Admin"])),
    db: AsyncSession = Depends(get_db)
):
    """
    Actualiza la configuración SMTP y políticas de retención.
    """
    query = select(ConfiguracionSistema).where(ConfiguracionSistema.id == 1)
    res = await db.execute(query)
    config = res.scalars().first()

    if not config:
        raise HTTPException(status_code=404, detail="Configuración base no encontrada.")

    config.correo_bienes_institucional = payload.correo_bienes_institucional
    config.smtp_server_config = payload.smtp_server_config
    config.tiempo_max_prestamo_herramientas = payload.tiempo_max_prestamo_herramientas
    config.dias_retencion_audios = payload.dias_retencion_audios
    config.dias_retencion_auditoria = payload.dias_retencion_auditoria

    await db.commit()
    await db.refresh(config)
    return config


# --- ALERTAS OPERATIVAS ---

@router.get("/alerts", response_model=List[AlertaSistemaResponse])
async def get_system_alerts(
    current_user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Obtiene las notificaciones pendientes de leer filtradas selectivamente según el rol del usuario conectado.
    El rol "Soporte Técnico" recibe también notificaciones operativas generales.
    El rol "Admin" recibe alertas de desabastecimiento de consumibles y siniestros de taller.
    """
    query = select(AlertasSistema).where(AlertasSistema.leida == False)
    
    # Enrutar selectivamente según rol
    if current_user.rol == "Admin":
        query = query.where(AlertasSistema.destinatario_rol == "Admin")
    else:
        query = query.where(AlertasSistema.destinatario_rol == "Soporte Técnico")

    query = query.order_by(AlertasSistema.created_at.desc())
    res = await db.execute(query)
    return res.scalars().all()

@router.post("/alerts/{id}/read")
async def archive_alert(
    id: int,
    current_user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Realiza el archivado lógico (Soft-Archive) de una alerta operativa.
    """
    query = select(AlertasSistema).where(AlertasSistema.id == id)
    res = await db.execute(query)
    alerta = res.scalars().first()

    if not alerta:
        raise HTTPException(status_code=404, detail="Notificación no encontrada.")

    # Validar que pertenezca a su rol para archivar
    if current_user.rol == "Admin" and alerta.destinatario_rol != "Admin":
        raise HTTPException(status_code=403, detail="No autorizado.")
    if current_user.rol != "Admin" and alerta.destinatario_rol == "Admin":
        raise HTTPException(status_code=403, detail="No autorizado.")

    alerta.leida = True
    await db.commit()
    return {"message": "Notificación archivada."}


# --- AUDITORÍA DE REGISTROS (DIFF LOG VISOR) ---

@router.get("/audit/logs", response_model=List[AuditoriaLogResponse])
async def get_audit_trail(
    tabla: Optional[str] = None,
    accion: Optional[str] = None,
    current_user: Usuario = Depends(require_roles(["Admin"])),
    db: AsyncSession = Depends(get_db)
):
    """
    Visor de logs de seguridad inmutables. Permite auditorías filtradas por tabla o acción.
    (Sólo accesible para el rol Administrador).
    """
    query = select(AuditoriaLog)
    if tabla:
        query = query.where(AuditoriaLog.tabla_afectada == tabla)
    if accion:
        query = query.where(AuditoriaLog.accion_ejecutada == accion)

    query = query.order_by(AuditoriaLog.timestamp.desc())
    res = await db.execute(query)
    return res.scalars().all()
