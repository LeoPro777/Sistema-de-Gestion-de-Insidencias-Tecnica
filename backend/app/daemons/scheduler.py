import os
import asyncio
from datetime import datetime, timedelta, date, time
from sqlalchemy import select, delete, text
from app.core.database import AsyncSessionLocal
from app.models.inventory import ConfiguracionSistema, AuditoriaLog
from app.models.incidents import PreOrden

async def execute_daily_maintenance() -> None:
    """
    Ejecuta el mantenimiento diario de base de datos y archivos físicos:
    1. Lee los días de retención desde la configuración única.
    2. Depura archivos de audio (.ogg) huérfanos/antiguos de órdenes cerradas o rechazadas.
    3. Purgar logs de auditoría antiguos.
    """
    print(f"[MAINTENANCE] Iniciando mantenimiento programado a las {datetime.now().strftime('%H:%M:%S')}...")
    
    async with AsyncSessionLocal() as db:
        # 1. Cargar configuraciones
        config_query = select(ConfiguracionSistema).where(ConfiguracionSistema.id == 1)
        res_config = await db.execute(config_query)
        config = res_config.scalars().first()

        dias_audios = config.dias_retencion_audios if config else 30
        dias_auditoria = config.dias_retencion_auditoria if config else 365

        # 2. Depuración de audios
        limite_audios = datetime.utcnow() - timedelta(days=dias_audios)
        audio_query = select(PreOrden).where(
            PreOrden.estado.in_(["RESUELTA", "RECHAZADA"]),
            PreOrden.created_at < limite_audios,
            PreOrden.audio_path != None
        )
        res_audios = await db.execute(audio_query)
        pre_ordenes_con_audio = res_audios.scalars().all()

        audio_dir = "/var/media/audios"
        deleted_audio_count = 0

        for po in pre_ordenes_con_audio:
            if po.audio_path:
                file_path = os.path.join(audio_dir, po.audio_path)
                try:
                    if os.path.exists(file_path):
                        os.remove(file_path)
                    po.audio_path = None # Limpiar en BD
                    deleted_audio_count += 1
                except Exception as ex:
                    print(f"[MAINTENANCE ERROR] No se pudo borrar el archivo físico {file_path}: {str(ex)}")
        
        # 3. Purgar logs de auditoría antiguos (bajo privilegios del dueño de la tabla)
        limite_auditoria = datetime.utcnow() - timedelta(days=dias_auditoria)
        
        # Ejecutar borrado directo
        audit_delete_query = delete(AuditoriaLog).where(AuditoriaLog.timestamp < limite_auditoria)
        del_result = await db.execute(audit_delete_query)
        deleted_audit_count = del_result.rowcount

        await db.commit()
        print(f"[MAINTENANCE COMPLETE] Se depuraron {deleted_audio_count} audios y se purgaron {deleted_audit_count} logs de auditoría obsoletos.")

async def scheduler_loop() -> None:
    """
    Loop en segundo plano que vigila el reloj y ejecuta execute_daily_maintenance a las 2:00 AM exactamente una vez por día.
    """
    print("[SCHEDULER] Iniciando planificador de mantenimiento a las 2:00 AM...")
    last_run_date: Optional[date] = None

    while True:
        try:
            now = datetime.now()
            current_date = now.date()
            
            # Verificar si es la hora del mantenimiento (2:00 AM) y no se ha ejecutado hoy
            if now.hour == 2 and now.minute == 0 and last_run_date != current_date:
                await execute_daily_maintenance()
                last_run_date = current_date

        except Exception as e:
            print(f"[SCHEDULER ERROR] Excepción crítica en el hilo planificador: {str(e)}")

        # Esperar 30 segundos antes del siguiente chequeo
        await asyncio.sleep(30)
