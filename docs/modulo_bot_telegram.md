# ESPECIFICACIÓN TÉCNICA E INTEGRACIÓN MODULAR: BOT DE TELEGRAM DE INGESTA INTELIGENTE
**Ecosistema Hospitalario Monolítico (FastAPI + React TS + PostgreSQL)**

Este documento contiene la especificación funcional, lógica y arquitectónica definitiva para la implementación del **Módulo del Bot de Telegram** integrado de manera nativa en el monolito de FastAPI. Este módulo actúa como el canal externo exclusivo de captura inteligente de incidencias mediante procesamiento de voz con Inteligencia Artificial (API de Gemini) y validación de seguridad de doble factor (OTP).

---

## 1. Visión General del Módulo del Bot

El Bot de Telegram funciona como una extensión del backend en FastAPI, compartiendo de forma directa la misma instancia de la base de datos **PostgreSQL**. Rompe con los enfoques tradicionales de menús rígidos de texto al delegar la comprensión del requerimiento del usuario en el pipeline de IA de **Gemini**.

### Reglas de Negocio Específicas del Bot
1. **Autenticación Obligatoria:** Ningún usuario puede interactuar con las funciones del bot si su `telegram_id` no está previamente vinculado de forma segura a un registro de la tabla `empleados` con estado estrictamente igual a `'Activo'`.
2. **Inmutabilidad de Datos de Captura:** El bot captura la voz del solicitante, el área y el **código identificador de la máquina** (número de activo o serial crudo). Estos datos se inyectan en el búfer de `pre_ordenes` para que el Soporte Técnico los audite.
3. **Persistencia y Calidad de Voz:** Las notas de voz se resguardan físicamente en el disco local del servidor monolito para permitir que los técnicos escuchen la modulación y descripción original en caso de discrepancias técnicas.

---

## 2. Interacción con la Capa de Datos (PostgreSQL)

El bot manipula e interactúa directamente con las siguientes entidades relacionales del esquema del sistema. Para dar soporte al requerimiento del número de máquina, se asegura la presencia de la columna `codigo_maquina_crudo`.


```sql
-- Estructuras específicas consultadas y modificadas por el proceso del Bot
ALTER TABLE pre_ordenes ADD COLUMN IF NOT EXISTS codigo_maquina_crudo VARCHAR(50);
```

### Campos Críticos de Control

* **`empleados.telegram_id`**: Identificador único emitido por Telegram. Si es `NULL`, el usuario se considera en estado de "Anónimo/No Vinculado".
* **`empleados.otp_hash` / `otp_expiracion**`: Credenciales efímeras para la validación de doble factor (seguridad OTP).
* **`empleados.intentos_fallidos`**: Contador de mitigación contra ataques de fuerza bruta en el canal de mensajería.
* **`pre_ordenes.codigo_maquina_crudo`**: Almacena el texto libre extraído por la IA o solicitado interactivamente que identifica la computadora, laptop o equipo médico afectado (ej: "PC-104", "SE-XYZ").

---

## 3. Especificación Detallada de Flujos Lógicos (Máquinas de Estado)

### FLUJO A: Registro, Validación de Seguridad y Vinculación (Onboarding OTP)

Este flujo blinda al bot contra suplantación de identidad y spam masivo desde cuentas externas a la institución.

```
[Usuario envía Cédula] ──> ¿Rate Limit Excedido? ──(Sí)──> [Ignorar / Bloquear]
                                  │ (No)
                                  ▼
                        ¿Existe Cédula Activa? ──(No)──> [Mensaje de Error / RRHH]
                                  │ (Sí)
                                  ▼
                     ¿Tiene Teléfono o Email? ──(No)──> [Excepción: Datos Desactualizados]
                                  │ (Sí)
                                  ▼
                   [Generar OTP + Cifrar Hash] ──> [Despachar SMS / Email]
                                  │
                                  ▼
                       [Espera de Token OTP]
                                  │
                   ¿OTP Válido y Vigente? ──(No)──> [Contar Intento / Solicitar Nuevo]
                                  │ (Sí)
                                  ▼
               [Mutar telegram_id de Empleado] ──> [Confirmar Éxito de Onboarding]
```

#### Algoritmo del Flujo A (Paso a Paso):

1. El usuario inicia el bot e ingresa su número de Cédula.
2. El sistema aplica un control de **Rate Limiting** basado en memoria. Si el chat de Telegram supera las 5 interacciones por minuto, el bot ignora temporalmente al emisor.
3. El backend consulta la tabla `empleados` buscando la cédula.
* *Excepción 1 (No registrado):* Si la cédula no existe o el empleado está marcado como `Inactivo`, el bot responde: *"Lo sentimos, el identificador ingresado no corresponde a personal autorizado en la nómina activa del hospital."*


4. El backend verifica que el registro tenga datos de contacto válidos en el campo `datos_contacto` (Email o Teléfono).
* *Excepción 2 (Datos Desactualizados):* Si los campos están vacíos, el bot notifica: *"No posee canales de verificación registrados. Por favor, diríjase al departamento de Recursos Humanos para actualizar su expediente."*


5. El sistema genera un token numérico aleatorio de 6 dígitos. Calcula el hash SHA-256 del código y lo guarda en `empleados.otp_hash`, estableciendo `otp_expiracion = NOW() + INTERVAL '15 minutes'`.
6. Se despacha el OTP por el canal seguro e institucional del empleado. El bot entra en estado de **Espera de Input**.
7. El usuario digiere el código en Telegram. El backend calcula el hash del dato entrante y lo compara con `otp_hash` verificando que `NOW() < otp_expiracion`.
* *Excepción 3 (OTP Erróneo / Expirado):* Si no coincide o expiró, incrementa `intentos_fallidos`. Si `intentos_fallidos >= 3`, borra el hash y bloquea el proceso por 30 minutos.


8. Si es correcto, el sistema ejecuta un `UPDATE` guardando el `telegram_id` de forma permanente en la ficha del empleado, limpia los campos OTP y confirma el éxito del Onboarding.

---

### FLUJO C: Creación de Reporte e Ingesta con Inteligencia Artificial

Flujo principal de operación interactiva para el reporte de fallas tecnológicas hospitalarias por voz.

```
[Usuario envía Nota de Voz] ──> ¿ telegram_id Activo? ──(No)──> [Rechazar Acceso]
                                       │ (Sí)
                                       ▼
                         [Transmitir Audio a Gemini]
                                       │
                        ¿Respuesta en Tiempo Límite? ──(No)──> [Timeout: Pedir Reintento]
                                       │ (Sí)
                                       ▼
                          ¿Inteligibilidad Alta? ──(No)──> [Pedir Repetir / Escribir]
                                       │ (Sí)
                                       ▼
                       ¿JSON cumple Esquema Estricto? ──(No)──> [Reintentar Parseo]
                                       │ (Sí)
                                       ▼
                       ¿Datos Obligatorios Completos?
                       (tipo, area_id, resumen, codigo_maquina_crudo)
                                       │
                                       ├──(No: Faltan Campos)──> [Guardar Parcial en Caché]
                                       │                                │
                                       │                                ▼
                                       │                     [Preguntar por Telegram]
                                       │ (Sí: Datos Llenos)             │
                                       ▼                                ▼
                          [Insertar en pre_ordenes] <─────────[Recibir Dato Faltante]
                                       │
                                       ▼
                       [Emitir Evento por WebSocket] ──> [Retornar UUID al Solicitante]
```

#### Algoritmo del Flujo C (Paso a Paso):

1. El usuario registrado presiona el botón de micrófono y envía una nota de voz explicando el problema.
2. El bot intercepta el evento. El backend ejecuta una pre-validación de seguridad flash:
```sql
SELECT estado FROM empleados WHERE telegram_id = :chat_id;
```

Si el estado es diferente de `'Activo'`, el bot aborta el flujo y emite un mensaje de rechazo de acceso.
3. El archivo de audio se descarga temporalmente y se transmite en un flujo asíncrono hacia la API de Gemini utilizando la característica de **Salidas Estructuradas (Structured Outputs)**.
4. **Manejo de Excepciones del Pipeline de IA:**
* *Excepción 1 (Timeout / Caída de Red):* Si la API de Gemini no responde en un margen de 15 segundos, el bot captura el fallo, limpia la memoria y responde: *"Estamos experimentando latencia con el procesador de lenguaje. Por favor, intente enviar su reporte nuevamente en unos instantes."*
* *Excepción 2 (Ininteligibilidad por Ruido):* Si la IA devuelve un flag de baja confianza o declara que el audio es incomprensible debido al ruido ambiente del hospital, el bot responde: *"El audio presenta mucho ruido de fondo o no es claro. Por favor, repita el mensaje de voz de forma más pausada o redacte el inconveniente en formato de texto."*


5. **Validación de Completitud e Interactividad de Datos Faltantes:** El esquema esperado por el backend exige cuatro datos clave: `tipo_requerimiento`, `area_id` (mapeado al catálogo), `resumen` y el **`codigo_maquina_crudo`**.
* *Mecánica de Intersección por Vacíos:* Si la IA extrae con éxito el resumen y el área, pero el usuario no pronunció el número de la máquina o el código del activo fijo, el monolito **no aborta la petición**.
* Almacena los datos parciales capturados en la caché de estado del backend vinculados al `chat_id` del usuario.
* El bot intercepta el flujo y le envía un mensaje interactivo al usuario por Telegram: *"He capturado tu reporte sobre el área de [Nombre de Área], pero para poder procesarlo en el taller necesito que me indiques el código o número impreso en la etiqueta de la máquina afectada (ej: PC-102 o Serial)."*


6. El usuario escribe el código de la máquina por texto. El bot recupera los datos parciales de la caché, acopla el `codigo_maquina_crudo` recién recibido y procede a ensamblar el payload final.
7. **Escritura Relacional:** El backend inserta los datos consolidados en la tabla `pre_ordenes`. PostgreSQL dispara de forma nativa la generación del UUID institucional único (`numero_reporte`).
8. **Activación de Alertas:** El monolito activa el subproceso de WebSockets despachando la notificación inmediata a las pantallas de React de Soporte Técnico, y el bot concluye el flujo enviando un mensaje final al empleado: *"Su reporte ha sido ingresado con éxito al taller informático hospitalario. ID de Seguimiento Oficial: #[UUID_CORTADO]"*.

---

## 4. Contratos de Integración y Esquema Pydantic para Gemini

El agente de desarrollo debe implementar el siguiente esquema estricto de Pydantic utilizando `google-genai` o `langchain` para forzar a Gemini a devolver el formato JSON exacto sin desviaciones tipográficas.

```python
from pydantic import BaseModel, Field
from typing import Optional

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
```

---

## 5. Reglas de Desarrollo Estrictas para el Agente (Veto List)

> * **PROHIBIDO** el almacenamiento persistente de credenciales o API Keys (Token de Telegram o Key de Gemini) en texto plano dentro del código fuente. Deben ser consumidas de manera mandatoria a través de `os.getenv()` mapeadas al archivo `.env` global del monolito.
> * **PROHIBIDO** realizar inserciones en la tabla `pre_ordenes` si la columna `telegram_id` no corresponde a un empleado real verificado. No se permiten reportes huérfanos de procedencia desconocida.
> * **PROHIBIDO** limpiar la caché de estado temporal de datos faltantes de un usuario si este no ha respondido la pregunta interactiva del bot, a menos que transcurra un tiempo de expiración (Timeout de sesión interactiva) fijado en 10 minutos.
> * **PROHIBIDO** escribir código síncrono bloqueante (`requests` de Python) para consumir APIs externas o procesar archivos de audio dentro de los flujos de Telegram. Toda llamada saliente debe implementarse mediante bibliotecas asíncronas (`httpx`, `aiofiles`) para evitar congelar el hilo principal de ejecución del monolito hospitalario.
