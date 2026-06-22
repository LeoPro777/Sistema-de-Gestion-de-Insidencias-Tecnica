import os
import uuid
import httpx
from fastapi import APIRouter, Depends, Request, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.config import settings
from app.services.bot_service import BotService

router = APIRouter(prefix="/bot", tags=["Telegram Bot"])

TELEGRAM_API_URL = f"https://api.telegram.org/bot{settings.BOT_API_KEY}"

async def send_telegram_message(chat_id: str, text: str):
    """Envía un mensaje asíncrono a un usuario de Telegram."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        await client.post(
            f"{TELEGRAM_API_URL}/sendMessage",
            json={"chat_id": chat_id, "text": text}
        )

async def download_telegram_file(file_id: str) -> str:
    """Descarga un archivo desde los servidores de Telegram de forma asíncrona y lo guarda localmente."""
    async with httpx.AsyncClient(timeout=60.0) as client:
        # 1. Obtener la ruta del archivo
        res = await client.get(f"{TELEGRAM_API_URL}/getFile?file_id={file_id}")
        res.raise_for_status()
        data = res.json()
        
        if not data.get("ok"):
            raise ValueError("Error obteniendo el archivo de Telegram.")
            
        file_path = data["result"]["file_path"]
        download_url = f"https://api.telegram.org/file/bot{settings.BOT_API_KEY}/{file_path}"
        
        # 2. Descargar el contenido
        res_file = await client.get(download_url)
        res_file.raise_for_status()
        
        # 3. Guardar en disco (Directorio storage/audios)
        audio_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "storage", "audios")
        os.makedirs(audio_dir, exist_ok=True)
        
        file_name = f"{uuid.uuid4()}.ogg"
        local_path = os.path.join(audio_dir, file_name)
        
        with open(local_path, "wb") as f:
            f.write(res_file.content)
            
        return local_path

async def execute_bot_action(action_data: dict):
    """Ejecuta la acción dictaminada por el BotService. Abre su propia sesión DB si es necesario."""
    from app.core.database import AsyncSessionLocal
    
    action = action_data.get("action")
    chat_id = action_data.get("chat_id")
    
    if action == "send_message":
        await send_telegram_message(chat_id, action_data["text"])
        
    elif action == "process_text_incident":
        try:
            async with AsyncSessionLocal() as db:
                result_action = await BotService.process_text_incident(db, chat_id, action_data["text"])
                await execute_bot_action(result_action)
        except Exception as e:
            print(f"[BOT ROUTER ERROR] Fallo al procesar texto: {e}")
            await send_telegram_message(chat_id, "Ocurrió un error interno al procesar su texto.")

    elif action == "download_and_process_audio":
        try:
            # 1. Descargar el archivo
            local_path = await download_telegram_file(action_data["file_id"])
            
            # 2. Enviar a Gemini y procesar en la BD
            async with AsyncSessionLocal() as db:
                result_action = await BotService.process_downloaded_audio(db, chat_id, local_path)
            
            # 3. Ejecutar la acción resultante (usualmente un mensaje de confirmación)
            await execute_bot_action(result_action)
            
        except Exception as e:
            print(f"[BOT ROUTER ERROR] Fallo en descarga/procesamiento: {e}")
            await send_telegram_message(chat_id, "Ocurrió un error al procesar su nota de voz. Por favor intente más tarde.")

@router.post("/webhook")
async def telegram_webhook(request: Request, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    """
    Endpoint principal (Webhook) para recibir actualizaciones de Telegram.
    Usa BackgroundTasks para no bloquear la respuesta a Telegram.
    """
    try:
        update = await request.json()
    except Exception:
        return {"status": "error", "detail": "Invalid JSON"}
        
    # Obtener qué acción debe tomar el bot según las reglas de negocio
    action_data = await BotService.process_telegram_update(db, update)
    
    # Delegar la ejecución de red (mensajes, descargas) a un task en background
    # para que FastAPI responda rápidamente 200 OK a Telegram.
    if action_data and action_data.get("action"):
        background_tasks.add_task(execute_bot_action, action_data)
        
    return {"status": "ok"}
