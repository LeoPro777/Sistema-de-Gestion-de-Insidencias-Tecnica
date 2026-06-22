import os
import sys
import time
import asyncio
import httpx
from loguru import logger
from dotenv import load_dotenv

# Cargar variables de entorno del backend
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

BOT_API_KEY = os.getenv("BOT_API_KEY")
if not BOT_API_KEY:
    logger.error("No se encontró BOT_API_KEY en el archivo .env")
    sys.exit(1)

TELEGRAM_API_URL = f"https://api.telegram.org/bot{BOT_API_KEY}"
LOCAL_WEBHOOK_URL = "http://localhost:8000/bot/webhook"

async def clear_webhook(client: httpx.AsyncClient):
    """Elimina cualquier webhook existente para permitir getUpdates."""
    logger.info("Eliminando Webhook de Telegram para habilitar Polling Local...")
    res = await client.get(f"{TELEGRAM_API_URL}/deleteWebhook")
    res.raise_for_status()
    data = res.json()
    if data.get("ok"):
        logger.success("Webhook eliminado correctamente.")
    else:
        logger.warning(f"Error al eliminar webhook: {data}")

async def forward_update(client: httpx.AsyncClient, update: dict):
    """Reenvía la actualización al servidor FastAPI local."""
    try:
        res = await client.post(LOCAL_WEBHOOK_URL, json=update, timeout=5.0)
        res.raise_for_status()
        logger.success(f"Update {update.get('update_id')} reenviada con éxito al Backend.")
    except Exception as e:
        logger.error(f"Error al reenviar Update {update.get('update_id')} al Backend (¿Está corriendo FastAPI?): {e}")

async def polling_loop():
    logger.info("=== MONITOR LOCAL DEL BOT DE TELEGRAM ===")
    logger.info(f"Escuchando mensajes en Telegram y reenviando a {LOCAL_WEBHOOK_URL}...")
    
    offset = 0
    timeout = 30
    
    async with httpx.AsyncClient(timeout=timeout + 10) as client:
        await clear_webhook(client)
        
        while True:
            try:
                # getUpdates con long polling
                url = f"{TELEGRAM_API_URL}/getUpdates?offset={offset}&timeout={timeout}"
                res = await client.get(url)
                res.raise_for_status()
                data = res.json()
                
                if not data.get("ok"):
                    logger.error(f"Telegram API Error: {data}")
                    await asyncio.sleep(5)
                    continue
                    
                updates = data.get("result", [])
                
                for update in updates:
                    update_id = update["update_id"]
                    # Filtrar un poco los logs visuales para mostrar qué llegó
                    if "message" in update:
                        msg = update["message"]
                        from_user = msg.get("from", {}).get("first_name", "Unknown")
                        if "text" in msg:
                            logger.info(f"[NUEVO MENSAJE] De: {from_user} | Texto: {msg['text']}")
                        elif "voice" in msg:
                            logger.info(f"[NUEVO AUDIO] De: {from_user} | Duración: {msg['voice'].get('duration')}s")
                    
                    # Reenviar de forma asíncrona pero sin esperar (para procesar rápido)
                    asyncio.create_task(forward_update(client, update))
                    
                    # Actualizar offset para el siguiente getUpdates
                    offset = update_id + 1
                    
            except httpx.TimeoutException:
                # Normal en long polling, continuamos
                pass
            except httpx.HTTPError as e:
                logger.error(f"Error HTTP de red: {e}")
                await asyncio.sleep(5)
            except Exception as e:
                logger.exception(f"Error inesperado en el loop de polling: {e}")
                await asyncio.sleep(5)

if __name__ == "__main__":
    # Configurar logger para ser más amigable en consola
    logger.remove()
    logger.add(sys.stdout, colorize=True, format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{message}</cyan>")
    
    try:
        asyncio.run(polling_loop())
    except KeyboardInterrupt:
        logger.info("Monitor detenido por el usuario.")
