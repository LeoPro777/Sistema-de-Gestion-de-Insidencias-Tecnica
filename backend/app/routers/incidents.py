from fastapi import APIRouter, Depends, HTTPException, Security, status, Header
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from typing import List, Optional
import os

from app.core.database import get_db
from app.models.auth import Usuario
from app.models.incidents import PreOrden, Orden, OrdenConsumible
from app.models.devices import Dispositivo
from app.schemas.incidents import (
    PreOrdenIngest, PreOrdenResponse, PreOrdenEdit,
    OrdenPromote, OrdenResponse, OrdenClose
)
from app.services.incident_service import IncidentService
from app.routers.auth import get_current_user, require_roles
from app.core.config import settings

router = APIRouter(prefix="/api/v1/incidencias", tags=["incidencias"])

# Función de verificación de X-API-Key para la ingesta externa del Bot
async def verify_api_key(x_api_key: str = Header(...)):
    if x_api_key != settings.BOT_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API Key inválida."
        )

# --- ENDPOINTS ---

@router.post("/ingest", response_model=dict, status_code=status.HTTP_201_CREATED)
async def ingest_incidencia(
    payload: PreOrdenIngest, 
    db: AsyncSession = Depends(get_db),
    _ = Depends(verify_api_key)
):
    """
    Endpoint seguro de ingesta externa. Utilizado por el Bot de Telegram para reportar fallas.
    """
    pre_orden = await IncidentService.process_telegram_ingest(db, payload)
    return {
        "status": "success",
        "message": "Incidencia cruda capturada con éxito en el búfer hospitalario",
        "data": {
            "numero_reporte": str(pre_orden.numero_reporte),
            "estado": pre_orden.estado,
            "created_at": pre_orden.created_at.isoformat()
        }
    }

@router.get("/pre", response_model=List[PreOrdenResponse])
async def get_pre_ordenes(
    current_user: Usuario = Depends(require_roles(["Admin", "Soporte Técnico"])),
    db: AsyncSession = Depends(get_db)
):
    """
    Obtiene las pre-órdenes en el búfer de entrada esperando refinamiento.
    """
    query = (
        select(PreOrden)
        .options(
            selectinload(PreOrden.empleado),
            selectinload(PreOrden.area),
            selectinload(PreOrden.dispositivo).selectinload(Dispositivo.area)
        )
        .where(PreOrden.estado == "PRE_ORDEN")
        .order_by(PreOrden.created_at.desc())
    )
    res = await db.execute(query)
    return res.scalars().all()

@router.get("/pre/{id}/audio")
async def get_pre_orden_audio(
    id: int,
    current_user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Descarga o reproduce el audio asociado a una pre-orden.
    """
    query = select(PreOrden).where(PreOrden.id == id)
    res = await db.execute(query)
    pre_orden = res.scalars().first()

    if not pre_orden or not pre_orden.audio_path:
        raise HTTPException(status_code=404, detail="Grabación de voz no encontrada.")

    audio_file = os.path.join("/var/media/audios", pre_orden.audio_path)
    if not os.path.exists(audio_file):
        raise HTTPException(status_code=404, detail="El archivo físico de audio no existe en el servidor.")

    return FileResponse(audio_file, media_type="audio/ogg")

@router.put("/pre/{id}", response_model=PreOrdenResponse)
async def update_pre_orden(
    id: int,
    payload: PreOrdenEdit,
    current_user: Usuario = Depends(require_roles(["Admin", "Soporte Técnico"])),
    db: AsyncSession = Depends(get_db)
):
    """
    Permite a Soporte Técnico editar por completo y refinar una pre-orden antes de ser promovida.
    """
    query = select(PreOrden).where(PreOrden.id == id)
    res = await db.execute(query)
    pre_orden = res.scalars().first()

    if not pre_orden:
        raise HTTPException(status_code=404, detail="Pre-orden no encontrada.")

    if pre_orden.estado != "PRE_ORDEN":
        raise HTTPException(status_code=400, detail="No se puede editar una pre-orden ya promovida.")

    pre_orden.area_id = payload.area_id
    pre_orden.tipo_requerimiento = payload.tipo_requerimiento
    pre_orden.urgencia = payload.urgencia
    pre_orden.resumen = payload.resumen
    pre_orden.device_id = payload.device_id

    await db.commit()
    query_full = (
        select(PreOrden)
        .options(
            selectinload(PreOrden.empleado),
            selectinload(PreOrden.area),
            selectinload(PreOrden.dispositivo).selectinload(Dispositivo.area)
        )
        .where(PreOrden.id == id)
    )
    res_full = await db.execute(query_full)
    return res_full.scalars().first()

@router.post("/pre/{id}/reject")
async def reject_pre_orden(
    id: int,
    current_user: Usuario = Depends(require_roles(["Admin", "Soporte Técnico"])),
    db: AsyncSession = Depends(get_db)
):
    """
    Descarta una pre-orden como spam (Soft-Delete a estado RECHADA).
    """
    query = select(PreOrden).where(PreOrden.id == id)
    res = await db.execute(query)
    pre_orden = res.scalars().first()

    if not pre_orden:
        raise HTTPException(status_code=404, detail="Pre-orden no encontrada.")

    pre_orden.estado = "RECHAZADA"
    await db.commit()
    return {"message": "Pre-orden descartada como spam (Rechazada)."}

@router.post("/active/promote", response_model=OrdenResponse)
async def promote_to_active(
    payload: OrdenPromote,
    current_user: Usuario = Depends(require_roles(["Admin", "Soporte Técnico"])),
    db: AsyncSession = Depends(get_db)
):
    """
    Promueve una pre-orden refinada a una Orden Activa, asignándola a un especialista técnico.
    """
    orden = await IncidentService.promote_pre_orden(
        db, 
        pre_orden_id=payload.pre_orden_id,
        device_id=payload.device_id,
        tecnico_id=payload.tecnico_id,
        soporte_id=current_user.id
    )
    return orden

@router.get("/active", response_model=List[OrdenResponse])
async def get_active_orders(
    current_user: Usuario = Depends(require_roles(["Admin", "Soporte Técnico", "Técnico Hardware", "Técnico Software"])),
    db: AsyncSession = Depends(get_db)
):
    """
    Obtiene las órdenes activas en el taller.
    Los técnicos de campo solo visualizan las tareas que tienen asignadas directamente.
    Soporte Técnico y Admin visualizan el tablero Kanban completo.
    """
    query = (
        select(Orden)
        .options(
            selectinload(Orden.pre_orden).selectinload(PreOrden.empleado),
            selectinload(Orden.pre_orden).selectinload(PreOrden.area),
            selectinload(Orden.pre_orden).selectinload(PreOrden.dispositivo).selectinload(Dispositivo.area),
            selectinload(Orden.dispositivo).selectinload(Dispositivo.area),
            selectinload(Orden.tecnico),
            selectinload(Orden.soporte),
            selectinload(Orden.consumibles).selectinload(OrdenConsumible.consumible)
        )
        .where(Orden.estado.in_(["ASIGNADA", "EN_PROCESO"]))
    )
    
    # Restricción RBAC: Técnicos de campo solo ven sus tickets
    if current_user.rol in ("Técnico Hardware", "Técnico Software"):
        query = query.where(Orden.tecnico_id == current_user.id)

    res = await db.execute(query)
    return res.scalars().all()

@router.put("/active/{id}/close", response_model=dict)
async def close_active_order(
    id: int,
    payload: OrdenClose,
    current_user: Usuario = Depends(require_roles(["Técnico Hardware", "Técnico Software"])),
    db: AsyncSession = Depends(get_db)
):
    """
    Endpoint para cierre técnico de tickets.
    Exige consumibles y diagnóstico final, restando materiales del taller.
    """
    orden = await IncidentService.close_orden(
        db, 
        orden_id=id, 
        data=payload,
        user_id=current_user.id, 
        user_rol=current_user.rol
    )
    return {
        "status": "success",
        "message": "Orden de servicio cerrada de forma exitosa. Historial clínico actualizado.",
        "data": {
            "orden_id": orden.id,
            "estado": orden.estado,
            "closed_at": orden.closed_at.isoformat() if orden.closed_at else None
        }
    }

@router.post("/active/{id}/revert", response_model=dict)
async def revert_order(
    id: int,
    current_user: Usuario = Depends(require_roles(["Técnico Hardware", "Técnico Software"])),
    db: AsyncSession = Depends(get_db)
):
    """
    Permite devolver un ticket a la bandeja de Soporte Técnico si fue mal clasificado.
    Cambia el estado de la Orden a RECHAZADA y restablece la PreOrden a PRE_ORDEN para su reclasificación.
    """
    query = select(Orden).where(Orden.id == id)
    res = await db.execute(query)
    orden = res.scalars().first()

    if not orden:
        raise HTTPException(status_code=404, detail="Orden no encontrada.")

    if orden.estado not in ("ASIGNADA", "EN_PROCESO"):
        raise HTTPException(status_code=400, detail="Solo se pueden devolver órdenes activas.")

    if orden.tecnico_id != current_user.id:
        raise HTTPException(status_code=403, detail="No está autorizado a revertir este ticket.")

    orden.estado = "RECHAZADA"
    
    if orden.pre_orden_id:
        po_query = select(PreOrden).where(PreOrden.id == orden.pre_orden_id)
        po_res = await db.execute(po_query)
        pre_orden = po_res.scalars().first()
        if pre_orden:
            pre_orden.estado = "PRE_ORDEN"
            pre_orden.device_id = None

    await db.commit()
    return {"message": "El ticket ha sido devuelto a la bandeja de Soporte Técnico exitosamente."}
