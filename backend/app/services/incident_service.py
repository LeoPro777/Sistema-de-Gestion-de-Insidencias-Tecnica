import os
import base64
import uuid
from datetime import datetime
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError, DBAPIError
from fastapi import HTTPException, status
import asyncpg
from sqlalchemy.orm import selectinload

from app.models.auth import Empleado, Usuario
from app.models.devices import Dispositivo
from app.models.incidents import PreOrden, Orden, OrdenConsumible
from app.models.inventory import InventarioItem
from app.schemas.incidents import PreOrdenIngest, PreOrdenEdit, OrdenClose, OrdenConsumibleCreate
from app.core.websocket import manager

class IncidentService:
    @staticmethod
    async def process_telegram_ingest(db: AsyncSession, data: PreOrdenIngest) -> PreOrden:
        """
        Ingesta una pre-orden desde el bot de Telegram.
        Valida que el telegram_id exista y esté activo en empleados.
        Decodifica y guarda la nota de voz en disco si se provee.
        """
        # Verificar empleado
        emp_query = select(Empleado).where(Empleado.telegram_id == data.telegram_id)
        emp_result = await db.execute(emp_query)
        empleado = emp_result.scalars().first()

        if not empleado:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Usuario de Telegram {data.telegram_id} no está vinculado a ningún empleado de nómina."
            )
        if empleado.estado != "Activo":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Operación bloqueada: El empleado asociado a esta cuenta se encuentra Inactivo."
            )

        # Procesar audio
        audio_filename = None
        if data.audio_base64_payload:
            try:
                # El directorio local donde guardamos los audios
                audio_dir = "/var/media/audios"
                os.makedirs(audio_dir, exist_ok=True)

                # Decodificar y escribir archivo
                audio_data = base64.b64decode(data.audio_base64_payload)
                audio_filename = f"{uuid.uuid4()}.ogg"
                audio_filepath = os.path.join(audio_dir, audio_filename)
                
                with open(audio_filepath, "wb") as f:
                    f.write(audio_data)
            except Exception as e:
                # Registrar error pero no interrumpir la ingesta del reporte
                print(f"[ERROR INGEST AUDIO] No se pudo guardar la nota de voz: {str(e)}")

        # Crear pre-orden
        pre_orden = PreOrden(
            telegram_id=data.telegram_id,
            tipo_requerimiento=data.tipo_requerimiento,
            area_id=data.area_id,
            urgencia=data.urgencia,
            resumen=data.resumen,
            audio_path=audio_filename,
            estado="PRE_ORDEN"
        )
        db.add(pre_orden)
        await db.commit()
        await db.refresh(pre_orden)

        # Cargar relaciones para el broadcast
        query_full = select(PreOrden).where(PreOrden.id == pre_orden.id)
        res_full = await db.execute(query_full)
        pre_orden_loaded = res_full.scalars().first()

        # Emitir broadcast por WebSockets a Soporte Técnico
        payload = {
            "event": "new_pre_orden",
            "pre_orden_id": pre_orden_loaded.id,
            "numero_reporte": str(pre_orden_loaded.numero_reporte),
            "urgencia": pre_orden_loaded.urgencia,
            "area": pre_orden_loaded.area.nombre if pre_orden_loaded.area else "Desconocido",
            "resumen": pre_orden_loaded.resumen,
            "created_at": pre_orden_loaded.created_at.isoformat()
        }
        await manager.broadcast(payload, role="Soporte Técnico")

        return pre_orden_loaded

    @staticmethod
    async def promote_pre_orden(
        db: AsyncSession, 
        pre_orden_id: int, 
        device_id: int, 
        tecnico_id: int, 
        soporte_id: int
    ) -> Orden:
        """
        Promueve una pre-orden de la bandeja de Soporte a una Orden Activa en estado ASIGNADA.
        Valida que el dispositivo y el técnico existan en el sistema.
        """
        # Buscar pre-orden con la relación de área cargada
        po_query = select(PreOrden).options(selectinload(PreOrden.area)).where(PreOrden.id == pre_orden_id)
        po_result = await db.execute(po_query)
        pre_orden = po_result.scalars().first()

        if not pre_orden:
            raise HTTPException(status_code=404, detail="Pre-orden no encontrada.")

        if pre_orden.estado != "PRE_ORDEN":
            raise HTTPException(
                status_code=400, 
                detail=f"La pre-orden ya se encuentra en estado {pre_orden.estado} y no puede ser promovida."
            )

        # Validar dispositivo
        dev_query = select(Dispositivo).where(Dispositivo.id == device_id)
        dev_result = await db.execute(dev_query)
        dispositivo = dev_result.scalars().first()
        if not dispositivo:
            raise HTTPException(status_code=404, detail="El dispositivo especificado no existe.")

        # Validar técnico
        tec_query = select(Usuario).where(Usuario.id == tecnico_id)
        tec_result = await db.execute(tec_query)
        tecnico = tec_result.scalars().first()
        if not tecnico:
            raise HTTPException(status_code=404, detail="El técnico asignado no existe.")

        # Transición y asignación
        pre_orden.estado = "ASIGNADA"
        pre_orden.device_id = device_id

        # Capturar propiedades necesarias antes del commit para evitar expiración y errores MissingGreenlet
        area_nombre = pre_orden.area.nombre if pre_orden.area else "Desconocido"
        dispositivo_marca = dispositivo.marca
        dispositivo_serial = dispositivo.serial
        pre_orden_urgencia = pre_orden.urgency if hasattr(pre_orden, 'urgency') else pre_orden.urgencia

        # Verificar si ya existe una orden previa vinculada (por ejemplo, que haya sido rechazada/revertida)
        ord_exist_query = select(Orden).where(Orden.pre_orden_id == pre_orden_id)
        ord_exist_res = await db.execute(ord_exist_query)
        orden = ord_exist_res.scalars().first()

        if orden:
            # Reutilizar y actualizar la orden existente
            orden.device_id = device_id
            orden.tecnico_id = tecnico_id
            orden.soporte_id = soporte_id
            orden.estado = "ASIGNADA"
            orden.diagnostico = None
            orden.solucion_parametrica = None
            orden.closed_at = None
        else:
            # Crear una nueva orden
            orden = Orden(
                pre_orden_id=pre_orden_id,
                device_id=device_id,
                tecnico_id=tecnico_id,
                soporte_id=soporte_id,
                estado="ASIGNADA"
            )
            db.add(orden)

        await db.commit()
        await db.refresh(orden)

        # Cargar relaciones completas para el WebSocket
        ord_query = (
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
            .where(Orden.id == orden.id)
        )
        ord_res = await db.execute(ord_query)
        orden_loaded = ord_res.scalars().first()

        # Emitir broadcast de orden asignada
        payload = {
            "event": "orden_assigned",
            "orden_id": orden_loaded.id,
            "tecnico_id": orden_loaded.tecnico_id,
            "estado": orden_loaded.estado,
            "urgencia": pre_orden_urgencia,
            "marca": dispositivo_marca,
            "serial": dispositivo_serial,
            "area": area_nombre
        }
        await manager.broadcast(payload, role="Soporte Técnico")
        if tecnico_id:
            await manager.send_personal_message(payload, user_id=tecnico_id)

        return orden_loaded

    @staticmethod
    async def close_orden(
        db: AsyncSession, 
        orden_id: int, 
        data: OrdenClose, 
        user_id: int, 
        user_rol: str
    ) -> Orden:
        """
        Cierra una orden de servicio de forma definitiva, descontando consumibles.
        Captura la excepción de stock negativo de PostgreSQL y la reporta como 409 Conflict.
        """
        # Establecer variables de auditoría de sesión para los triggers
        await db.execute(text("SELECT set_config('app.current_user_id', :uid, true)"), {"uid": str(user_id)})
        await db.execute(text("SELECT set_config('app.current_user_rol', :urol, true)"), {"urol": user_rol})

        # Buscar orden
        query = select(Orden).where(Orden.id == orden_id)
        res = await db.execute(query)
        orden = res.scalars().first()

        if not orden:
            raise HTTPException(status_code=404, detail="Orden de servicio no encontrada.")

        if orden.estado in ("RESUELTA", "RECHAZADA"):
            raise HTTPException(status_code=400, detail=f"La orden ya se encuentra en estado terminal: {orden.estado}.")

        # Actualizar datos de cierre
        orden.estado = "RESUELTA"
        orden.diagnostico = data.diagnostico
        orden.solucion_parametrica = data.solucion_parametrica
        orden.closed_at = datetime.utcnow()

        # Si había pre-orden vinculada, actualizar su estado a RESUELTA
        if orden.pre_orden_id:
            po_query = select(PreOrden).where(PreOrden.id == orden.pre_orden_id)
            po_res = await db.execute(po_query)
            pre_orden = po_res.scalars().first()
            if pre_orden:
                pre_orden.estado = "RESUELTA"

        # Registrar consumibles utilizados
        for item in data.consumibles_utilizados:
            consumo = OrdenConsumible(
                orden_id=orden_id,
                consumible_id=item.consumible_id,
                cantidad=item.cantidad
            )
            db.add(consumo)

        # Guardar en base de datos capturando errores de stock negativo
        try:
            await db.commit()
        except (IntegrityError, DBAPIError) as e:
            await db.rollback()

            # Buscar si el error original fue CheckViolationError (código PG 23514)
            orig_error = e.orig
            if hasattr(orig_error, "sqlstate") and orig_error.sqlstate == "23514":
                # Encontrar cuál de los consumibles causó el desabastecimiento
                for item in data.consumibles_utilizados:
                    it_query = select(InventarioItem).where(InventarioItem.id == item.consumible_id)
                    it_res = await db.execute(it_query)
                    inv_item = it_res.scalars().first()

                    if inv_item and inv_item.stock < item.cantidad:
                        # Lanzar la respuesta estructurada de conflicto
                        raise HTTPException(
                            status_code=status.HTTP_409_CONFLICT,
                            detail={
                                "error_code": "INVENTORY_STOCK_EXHAUSTED",
                                "message": "La operación transaccional no pudo completarse debido a desabastecimiento físico en el taller.",
                                "details": {
                                    "item_id": inv_item.id,
                                    "nombre_solicitado": inv_item.nombre,
                                    "stock_disponible": inv_item.stock,
                                    "cantidad_solicitada": item.cantidad
                                },
                                "action_required": "Habilitar guardado de contingencia en Borrador Técnico en el cliente web."
                            }
                        )

            # Re-lanzar si es otro tipo de error
            raise HTTPException(status_code=400, detail=f"Error al procesar transacciones del cierre: {str(e)}")

        # Cargar relaciones actualizadas para WebSocket
        query_full = select(Orden).where(Orden.id == orden_id)
        res_full = await db.execute(query_full)
        orden_loaded = res_full.scalars().first()

        # Emitir broadcast de orden resuelta
        payload = {
            "event": "orden_resolved",
            "orden_id": orden_loaded.id,
            "estado": orden_loaded.estado,
            "closed_at": orden_loaded.closed_at.isoformat() if orden_loaded.closed_at else None
        }
        await manager.broadcast(payload, role="Soporte Técnico")
        if orden_loaded.tecnico_id:
            await manager.send_personal_message(payload, user_id=orden_loaded.tecnico_id)

        return orden_loaded
