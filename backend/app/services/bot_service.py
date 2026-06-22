import os
import uuid
import base64
import hashlib
import random
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException
from google import genai
from google.genai import types

from app.core.config import settings
from app.models.auth import Empleado
from app.models.incidents import PreOrden
from app.models.devices import AreaHospital
from app.core.websocket import manager

# Configuración del cliente Gemini
# Se inicializa solo si se provee la API KEY
genai_client = genai.Client(api_key=settings.GEMINI_API_KEY) if settings.GEMINI_API_KEY != "tu_gemini_api_key_aqui" else None

class EsquemaIncidenciaGemini(BaseModel):
    tipo_requerimiento: str = Field(
        ..., 
        description="Clasificación primaria del problema. Debe ser estrictamente 'Hardware' o 'Software'."
    )
    area_nombre_sugerido: str = Field(
        ..., 
        description="Nombre del departamento o dependencia física del hospital mencionado en el audio (ej: Emergencia, UCI, Radiología)."
    )
    urgencia: str = Field(
        ..., 
        description="Nivel de prioridad deducido. Debe ser strictly 'Crítica', 'Alta', 'Media' o 'Baja' basándose en el riesgo del área o del paciente."
    )
    resumen: str = Field(
        ..., 
        description="Descripción compacta, técnica y depurada del síntoma de la falla reportada por el usuario."
    )
    codigo_maquina_crudo: Optional[str] = Field(
        None, 
        description="Código identificador del activo informático o serial de la máquina si fue mencionado explícitamente en el mensaje."
    )
    inteligibilidad_valida: bool = Field(
        ..., 
        description="Flag booleano. False si el audio posee solo ruido, música o palabras sin coherencia técnica."
    )

# Caché en memoria para reportes parciales (Flujo C - Interactividad)
# Key: telegram_id (str), Value: Dict con datos parciales
pending_reports: Dict[str, Dict[str, Any]] = {}

class BotService:
    @staticmethod
    async def process_telegram_update(db: AsyncSession, update: dict) -> dict:
        """
        Enrutador principal asíncrono para las actualizaciones de Telegram.
        """
        if "message" not in update:
            return {"status": "ignored"}
        
        message = update["message"]
        chat_id = str(message["chat"]["id"])
        
        # Verificar si el usuario ya está vinculado de forma segura
        query = select(Empleado).where(Empleado.telegram_id == chat_id)
        result = await db.execute(query)
        empleado = result.scalars().first()

        # Si ESTÁ VINCULADO Y ACTIVO
        if empleado and empleado.estado == "Activo":
            # Si responde a una pregunta interactiva (falta código de máquina)
            if chat_id in pending_reports and "text" in message:
                return await BotService._handle_pending_report_reply(db, chat_id, message["text"])
            
            # Si envía nota de voz normal (Flujo C)
            if "voice" in message:
                file_id = message["voice"]["file_id"]
                return await BotService._flujo_c_procesar_audio(db, chat_id, file_id)
            
            # Si envía un reporte por texto directo
            if "text" in message:
                return {"action": "process_text_incident", "chat_id": chat_id, "text": message["text"]}
            
            return {"action": "send_message", "chat_id": chat_id, "text": "Formato no soportado. Por favor envíe una nota de voz o redacte el problema en texto."}

        # Si NO ESTÁ VINCULADO (Flujo A: Onboarding)
        if "text" in message:
            text = message["text"].strip()
            if text.isdigit():
                if len(text) == 6:
                    # Puede ser un OTP o una cédula de 6 dígitos. Comprobamos si el hash existe.
                    input_hash = hashlib.sha256(text.encode()).hexdigest()
                    query = select(Empleado).where(Empleado.otp_hash == input_hash)
                    result = await db.execute(query)
                    emp_otp = result.scalars().first()
                    
                    if emp_otp:
                        return await BotService._flujo_a_verificar_otp(db, chat_id, text)
                    else:
                        return await BotService._flujo_a_iniciar_onboarding(db, chat_id, text)
                elif len(text) > 6:
                    return await BotService._flujo_a_iniciar_onboarding(db, chat_id, text)
            
            return {"action": "send_message", "chat_id": chat_id, "text": "Bienvenido al Bot de Soporte Técnico. Envíe su número de Cédula para vincular su cuenta, o envíe una nota de voz si ya está registrado."}

        return {"status": "unhandled"}

    @staticmethod
    async def _flujo_a_iniciar_onboarding(db: AsyncSession, chat_id: str, cedula: str) -> dict:
        """Inicia el Flujo A: Validar cédula y enviar OTP"""
        query = select(Empleado).where(Empleado.cedula == cedula)
        result = await db.execute(query)
        empleado = result.scalars().first()

        if not empleado or empleado.estado != "Activo":
            return {"action": "send_message", "chat_id": chat_id, "text": "Lo sentimos, el identificador ingresado no corresponde a personal autorizado en la nómina activa del hospital."}

        # Validar datos de contacto
        contacto = empleado.datos_contacto or {}
        if not contacto.get("email") and not contacto.get("telefono"):
            return {"action": "send_message", "chat_id": chat_id, "text": "No posee canales de verificación registrados. Por favor, diríjase al departamento de Recursos Humanos para actualizar su expediente."}

        # Generar OTP
        otp_code = str(random.randint(100000, 999999))
        otp_hash = hashlib.sha256(otp_code.encode()).hexdigest()
        
        empleado.otp_hash = otp_hash
        empleado.otp_expiracion = datetime.utcnow() + timedelta(minutes=15)
        empleado.intentos_fallidos = 0
        
        await db.commit()

        # Simular envío de OTP
        print(f"[BOT SERVICE OTP SIMULATION] Enviando OTP {otp_code} al empleado {empleado.nombre} ({contacto.get('email', 'Sin Email')})")

        return {"action": "send_message", "chat_id": chat_id, "text": f"Se ha enviado un código de seguridad de 6 dígitos a su correo/teléfono registrado. Por favor ingréselo aquí para vincular su dispositivo.\n\n*(MODO DESARROLLO)* Tu código OTP es: {otp_code}"}

    @staticmethod
    async def _flujo_a_verificar_otp(db: AsyncSession, chat_id: str, otp_code: str) -> dict:
        """Flujo A: Verificar el OTP ingresado"""
        # Buscar empleado que tenga un OTP pendiente y coincida con el hash
        input_hash = hashlib.sha256(otp_code.encode()).hexdigest()
        
        # En una implementación real, tendríamos que buscar al empleado por la cédula que inició el trámite, 
        # pero como no la guardamos en estado temporal de TG, buscamos por hash. 
        # Cuidado con colisiones, se recomienda tener estado o cache del chat_id -> cedula.
        # Por simplicidad, buscaremos el hash.
        query = select(Empleado).where(Empleado.otp_hash == input_hash)
        result = await db.execute(query)
        empleado = result.scalars().first()

        if not empleado:
            return {"action": "send_message", "chat_id": chat_id, "text": "Código incorrecto o no hay solicitud pendiente."}

        if empleado.otp_expiracion < datetime.utcnow():
            empleado.intentos_fallidos += 1
            if empleado.intentos_fallidos >= 3:
                empleado.otp_hash = None
            await db.commit()
            return {"action": "send_message", "chat_id": chat_id, "text": "El código ha expirado o ha superado el límite de intentos."}

        # Éxito: Vincular telegram_id
        empleado.telegram_id = chat_id
        empleado.otp_hash = None
        empleado.otp_expiracion = None
        empleado.intentos_fallidos = 0
        await db.commit()

        return {"action": "send_message", "chat_id": chat_id, "text": "¡Vinculación exitosa! Ya puede enviar notas de voz para reportar incidencias."}

    @staticmethod
    async def _flujo_c_procesar_audio(db: AsyncSession, chat_id: str, file_id: str) -> dict:
        """Flujo C: Recibir audio, enviar a Gemini y procesar JSON estructurado."""
        # Verificar que el usuario está vinculado y activo
        query = select(Empleado).where(Empleado.telegram_id == chat_id)
        result = await db.execute(query)
        empleado = result.scalars().first()

        if not empleado or empleado.estado != "Activo":
            return {"action": "send_message", "chat_id": chat_id, "text": "Acceso denegado. Su cuenta no está autorizada o vinculada."}

        # Descargar audio (Deberá ser implementado usando httpx con Telegram Bot API)
        # Por ahora usaremos un flujo mock para la integración de Gemini ya que dependemos de httpx y get_file
        # En el router bot.py implementaremos la descarga física. Aquí asumimos que obtenemos el path.
        return {"action": "download_and_process_audio", "file_id": file_id, "chat_id": chat_id}

    @staticmethod
    async def process_downloaded_audio(db: AsyncSession, chat_id: str, audio_path: str) -> dict:
        """Continúa el Flujo C una vez descargado el audio físicamente"""
        if not genai_client:
            return {"action": "send_message", "chat_id": chat_id, "text": "El sistema de IA no está configurado."}

        try:
            # Subir o procesar el archivo local con Gemini
            # Google GenAI SDK permite subir archivos o mandar bytes. Para ogg podemos enviar los bytes con mime_type
            with open(audio_path, "rb") as f:
                audio_bytes = f.read()

            response = genai_client.models.generate_content(
                model='gemini-2.5-flash',
                contents=[
                    types.Part.from_bytes(
                        data=audio_bytes,
                        mime_type='audio/ogg'
                    ),
                    "Extrae la información de la incidencia técnica reportada en el audio."
                ],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=EsquemaIncidenciaGemini,
                    temperature=0.1
                )
            )

            if not response.text:
                raise ValueError("Respuesta vacía de Gemini")

            # La SDK devuelve un string JSON que podemos validar con Pydantic
            data = EsquemaIncidenciaGemini.parse_raw(response.text)

            if not data.inteligibilidad_valida:
                return {"action": "send_message", "chat_id": chat_id, "text": "El audio presenta mucho ruido de fondo o no es claro. Por favor, repita el mensaje de voz de forma más pausada o redacte el inconveniente en formato de texto."}

            # Buscar el area_id basado en area_nombre_sugerido
            # Busqueda simple por nombre
            area_query = select(AreaHospital).where(AreaHospital.nombre.ilike(f"%{data.area_nombre_sugerido}%"))
            area_res = await db.execute(area_query)
            area = area_res.scalars().first()
            area_id = area.id if area else 1 # Fallback a ID 1 si no se encuentra (para evitar fallos por FK en MVP)

            if not data.codigo_maquina_crudo:
                # Faltan datos obligatorios, guardar en caché e interactuar
                pending_reports[chat_id] = {
                    "tipo_requerimiento": data.tipo_requerimiento,
                    "area_id": area_id,
                    "urgencia": data.urgencia,
                    "resumen": data.resumen,
                    "audio_path": audio_path,
                    "timestamp": datetime.utcnow()
                }
                return {"action": "send_message", "chat_id": chat_id, "text": f"He capturado tu reporte sobre el área de {data.area_nombre_sugerido}, pero para poder procesarlo en el taller necesito que me indiques el código o número impreso en la etiqueta de la máquina afectada (ej: PC-102 o Serial)."}

            # Si tenemos todos los datos, creamos la pre-orden
            return await BotService._crear_pre_orden(
                db, chat_id, data.tipo_requerimiento, area_id, data.urgencia, data.resumen, data.codigo_maquina_crudo, audio_path
            )

        except Exception as e:
            print(f"[GEMINI ERROR] {str(e)}")
            return {"action": "send_message", "chat_id": chat_id, "text": "Estamos experimentando latencia con el procesador de lenguaje. Por favor, intente enviar su reporte nuevamente en unos instantes."}

    @staticmethod
    async def process_text_incident(db: AsyncSession, chat_id: str, text: str) -> dict:
        """Procesa una incidencia técnica enviada por texto usando IA para extraer los datos estructurados."""
        if not genai_client:
            return {"action": "send_message", "chat_id": chat_id, "text": "El sistema de IA no está configurado."}

        try:
            response = genai_client.models.generate_content(
                model='gemini-2.5-flash',
                contents=[
                    text,
                    "Extrae la información de la incidencia técnica reportada en el texto proporcionado."
                ],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=EsquemaIncidenciaGemini,
                    temperature=0.1
                )
            )

            if not response.text:
                raise ValueError("Respuesta vacía de Gemini")

            data = EsquemaIncidenciaGemini.parse_raw(response.text)

            if not data.inteligibilidad_valida:
                return {"action": "send_message", "chat_id": chat_id, "text": "No pude entender o clasificar técnicamente tu problema. Por favor redacta el inconveniente de manera más clara."}

            area_query = select(AreaHospital).where(AreaHospital.nombre.ilike(f"%{data.area_nombre_sugerido}%"))
            area_res = await db.execute(area_query)
            area = area_res.scalars().first()
            area_id = area.id if area else 1 

            if not data.codigo_maquina_crudo:
                pending_reports[chat_id] = {
                    "tipo_requerimiento": data.tipo_requerimiento,
                    "area_id": area_id,
                    "urgencia": data.urgencia,
                    "resumen": data.resumen,
                    "audio_path": None,
                    "timestamp": datetime.utcnow()
                }
                return {"action": "send_message", "chat_id": chat_id, "text": f"He capturado tu reporte sobre el área de {data.area_nombre_sugerido}, pero necesito que me indiques el código o número impreso en la etiqueta de la máquina afectada (ej: PC-102)."}

            return await BotService._crear_pre_orden(
                db, chat_id, data.tipo_requerimiento, area_id, data.urgencia, data.resumen, data.codigo_maquina_crudo, None
            )

        except Exception as e:
            print(f"[GEMINI TEXT ERROR] {str(e)}")
            return {"action": "send_message", "chat_id": chat_id, "text": "Estamos experimentando fallas al procesar tu texto. Por favor intente más tarde."}

    @staticmethod
    async def _handle_pending_report_reply(db: AsyncSession, chat_id: str, texto: str) -> dict:
        """Maneja la respuesta de texto para completar el código de máquina."""
        reporte = pending_reports.pop(chat_id)
        
        # Validar expiración (ej: 10 mins)
        if datetime.utcnow() - reporte["timestamp"] > timedelta(minutes=10):
            return {"action": "send_message", "chat_id": chat_id, "text": "La sesión interactiva ha expirado. Por favor, envíe su nota de voz nuevamente."}

        codigo_maquina = texto.strip()

        return await BotService._crear_pre_orden(
            db, 
            chat_id, 
            reporte["tipo_requerimiento"], 
            reporte["area_id"], 
            reporte["urgencia"], 
            reporte["resumen"], 
            codigo_maquina, 
            reporte["audio_path"]
        )

    @staticmethod
    async def _crear_pre_orden(db: AsyncSession, chat_id: str, tipo: str, area_id: int, urgencia: str, resumen: str, codigo: str, audio: str) -> dict:
        """Crea la pre_orden en BD y emite el WebSocket"""
        pre_orden = PreOrden(
            telegram_id=chat_id,
            tipo_requerimiento=tipo,
            area_id=area_id,
            urgencia=urgencia,
            resumen=resumen,
            codigo_maquina_crudo=codigo,
            audio_path=audio,
            estado="PRE_ORDEN"
        )
        db.add(pre_orden)
        await db.commit()
        await db.refresh(pre_orden)

        # Emitir WebSocket
        payload = {
            "event": "new_pre_orden",
            "pre_orden_id": pre_orden.id,
            "numero_reporte": str(pre_orden.numero_reporte),
            "urgencia": pre_orden.urgencia,
            "resumen": pre_orden.resumen,
            "codigo_maquina": pre_orden.codigo_maquina_crudo
        }
        await manager.broadcast(payload, role="Soporte Técnico")

        uuid_corto = str(pre_orden.numero_reporte).split("-")[0].upper()
        return {"action": "send_message", "chat_id": chat_id, "text": f"Su reporte ha sido ingresado con éxito al taller informático hospitalario. ID de Seguimiento Oficial: #{uuid_corto}"}
