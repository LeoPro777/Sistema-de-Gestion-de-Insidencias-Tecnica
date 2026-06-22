import sys
import json
import asyncio
from datetime import datetime
from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger
from sqlalchemy.exc import DBAPIError

from app.core.config import settings
from app.routers import auth, incidents, inventory, devices, reports, system, bot
from app.services.outbox_worker import outbox_worker_loop
from app.daemons.scheduler import scheduler_loop

# --- 1. CONFIGURACIÓN DE LOGS ESTRUCTURADOS JSON ---
def json_formatter(message):
    """
    Serializador estructurado JSON para Loguru.
    Vuelca todas las salidas del servidor en formato JSON de una sola línea.
    """
    record = message.record
    log_payload = {
        "timestamp": record["time"].isoformat(),
        "level": record["level"].name,
        "module": record["name"],
        "message": record["message"]
    }
    if record["exception"]:
        log_payload["exception"] = {
            "type": record["exception"].type.__name__,
            "value": str(record["exception"].value)
        }
    # Vuelca al stdout estándar de Docker
    sys.stdout.write(json.dumps(log_payload) + "\n")
    sys.stdout.flush()

# Desactivar loggers predeterminados de Uvicorn y configurar el estructurado
logger.remove()
logger.add(json_formatter)

# --- 2. INICIALIZACIÓN DE LA APLICACIÓN FASTAPI ---
app = FastAPI(
    title="Sistema Monolítico Hospitalario",
    version="1.0.0",
    description="Backend Monolítico para Incidentes, Almacén y Control Patrimonial"
)

# Configuración de CORS para canalizar peticiones del cliente React
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- 3. MIDDLEWARE DE REGISTRO ESTRUCTURADO HTTP ---
@app.middleware("http")
async def http_logging_middleware(request: Request, call_next):
    start_time = datetime.utcnow()
    response = await call_next(request)
    duration = (datetime.utcnow() - start_time).total_seconds() * 1000

    logger.info(f"Request: {request.method} {request.url.path} - Status: {response.status_code} - Duration: {duration:.2f}ms")
    return response


# --- 4. MANEJADOR GLOBAL DE EXCEPCIONES RELACIONALES ---
@app.exception_handler(DBAPIError)
async def database_error_handler(request: Request, exc: DBAPIError):
    """
    Intercepta excepciones arrojadas directamente por PostgreSQL (como violaciones de CHECK).
    """
    orig_error = getattr(exc, "orig", None)
    sqlstate = getattr(orig_error, "sqlstate", None)

    # Código PostgreSQL 23514: Violación de Restricción CHECK (como stock negativo)
    if sqlstate == "23514":
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={
                "error_code": "INVENTORY_STOCK_EXHAUSTED",
                "message": "La operación relacional no pudo completarse debido a que viola límites lógicos de stock.",
                "details": str(orig_error)
            }
        )
    
    # Código PostgreSQL 23503: Violación de Llave Foránea (Soft-Delete e integridad restrict)
    if sqlstate == "23503":
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={
                "error_code": "FOREIGN_KEY_VIOLATION",
                "message": "Operación de integridad relacional denegada. El registro está vinculado a activos existentes.",
                "details": str(orig_error)
            }
        )

    # Excepción por trigger procedural raise exception (Soft-Delete)
    # En PostgreSQL, errores lanzados con raise exception sin código específico caen en P0001
    if sqlstate == "P0001":
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={
                "error_code": "OPERATIONAL_TRIGGER_REJECTION",
                "message": str(orig_error)
            }
        )

    # Retornar error de base de datos genérico
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error_code": "DATABASE_TRANSACTION_ERROR",
            "message": "Ha ocurrido una falla inesperada en el motor relacional de base de datos.",
            "details": str(orig_error)
        }
    )


# --- 5. REGISTRO DE ROUTERS ---
app.include_router(auth.router)
app.include_router(incidents.router)
app.include_router(inventory.router)
app.include_router(devices.router)
app.include_router(reports.router)
app.include_router(system.router)
app.include_router(bot.router)


# --- 6. EVENTOS DE ARRANQUE Y LANZAMIENTO DE DAEMONS ---
@app.on_event("startup")
async def startup_event():
    import os
    logger.info("Iniciando servidores FastAPI y registrando Daemons operacionales...")
    
    # Asegurar la existencia del directorio físico para audios del Bot
    audio_dir = os.path.join(os.path.dirname(__file__), "storage", "audios")
    os.makedirs(audio_dir, exist_ok=True)
    
    # Iniciar el outbox worker en segundo plano
    asyncio.create_task(outbox_worker_loop())
    
    # Iniciar el planificador diario a las 2:00 AM
    asyncio.create_task(scheduler_loop())
