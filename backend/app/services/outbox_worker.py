import smtplib
import asyncio
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from sqlalchemy import select
from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.inventory import ColaCorreosOutbox

async def send_smtp_email(destinatario: str, asunto: str, cuerpo_html: str) -> None:
    """
    Envía un correo electrónico SMTP utilizando smtplib en un hilo asíncrono para evitar bloquear el loop.
    En caso de error, levanta la excepción original.
    """
    def _send():
        # Crear mensaje
        msg = MIMEMultipart("alternative")
        msg["From"] = settings.SMTP_USER
        msg["To"] = destinatario
        msg["Subject"] = asunto

        part = MIMEText(cuerpo_html, "html", "utf-8")
        msg.attach(part)

        # Conectar y enviar
        # Usamos SMTP estándar (con TLS si se requiere)
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.sendmail(settings.SMTP_USER, destinatario, msg.as_string())

    # Ejecutar en hilo de fondo de asyncio
    await asyncio.to_thread(_send)

async def process_outbox_queue() -> None:
    """
    Busca correos pendientes en la cola outbox, comprueba el margen de reintentos
    (15 minutos por cada intento previo) y los envía por SMTP.
    En desarrollo, si SMTP falla, vuelca el HTML a logs para no bloquear el flujo del negocio.
    """
    async with AsyncSessionLocal() as db:
        # Consultar ítems no procesados con menos de 5 intentos
        query = select(ColaCorreosOutbox).where(
            ColaCorreosOutbox.procesado == False,
            ColaCorreosOutbox.intentos < 5
        )
        result = await db.execute(query)
        emails = result.scalars().all()

        now = datetime.now(timezone.utc).replace(tzinfo=None)

        for email in emails:
            # Margen de reintento: intentos * 15 minutos
            next_attempt_time = email.created_at + timedelta(minutes=email.intentos * 15)
            if now < next_attempt_time:
                continue

            print(f"[OUTBOX WORKER] Procesando correo ID {email.id} destinado a {email.destinatario}")
            email.intentos += 1

            try:
                # Intentar enviar correo real
                await send_smtp_email(
                    destinatario=email.destinatario,
                    asunto=email.asunto,
                    cuerpo_html=email.cuerpo_html
                )
                email.procesado = True
                print(f"[OUTBOX WORKER] Correo ID {email.id} enviado exitosamente a {email.destinatario}")
            except Exception as e:
                db_err_msg = str(e)
                print(f"[SMTP SEND FAIL] Error al enviar correo ID {email.id} a {email.destinatario}: {db_err_msg}")
                
                # Si estamos en ambiente de desarrollo (development), simular el envío exitoso en logs
                if settings.ENVIRONMENT == "development":
                    print(f"\n========================================================")
                    print(f"[DEV MODE SMTP BYPASS] Simulación de Correo:")
                    print(f"Destinatario: {email.destinatario}")
                    print(f"Asunto: {email.asunto}")
                    print(f"Cuerpo HTML:\n{email.cuerpo_html}")
                    print(f"========================================================\n")
                    # Para pruebas fáciles de desarrollo, marcamos procesado como True
                    email.procesado = True

            await db.commit()

async def outbox_worker_loop() -> None:
    """
    Loop indefinido del daemon worker. Se ejecuta cada 60 segundos buscando actas en cola.
    """
    print("[OUTBOX WORKER] Lanzando daemon worker de cola SMTP...")
    while True:
        try:
            await process_outbox_queue()
        except Exception as e:
            print(f"[OUTBOX WORKER CRITICAL] Error inesperado en el ciclo: {str(e)}")
        await asyncio.sleep(60)
