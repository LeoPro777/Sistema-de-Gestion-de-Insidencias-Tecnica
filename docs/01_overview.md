# 1. CATEGORÍA: Visión General y Alcance

## 1.1. Propósito del Sistema

El Sistema Monolítico Hospitalario de Gestión de Incidencias, Control Patrimonial e Ingesta Inteligente resuelve de forma definitiva la fragmentación operativa, la pérdida de trazabilidad de los activos fijos y la lentitud en los tiempos de respuesta ante fallas de infraestructura tecnológica dentro del entorno hospitalario. Su objetivo principal es centralizar y automatizar el ciclo de vida de los incidentes de hardware y software (MTTR) mediante un canal web de control interno unificado y una pasarela de ingesta externa automatizada que procesa reportes crudos y notas de voz estructuradas por Inteligencia Artificial.

## 1.2. Alcance del Proyecto

* **En Alcance (In Scope):**
  * Desarrollo del backend monolítico completo utilizando FastAPI y persistencia relacional estricta en PostgreSQL.
  * Desarrollo de la interfaz de usuario web SPA modular utilizando React y TypeScript.
  * Canal de comunicación asíncrona bidireccional vía WebSockets nativos para sincronización estatal del taller técnico.
  * Endpoint protegido de ingesta externa (`/api/v1/incidencias/ingest`) para la recepción de incidencias procesadas por el Bot de Telegram.
  * Automatización de inventario por Triggers relacionales, control de concurrencia e implementación del Patrón Outbox para notificaciones oficiales a Bienes Nacionales.

* **Fuera de Alcance (Out of Scope):**
  * El desarrollo, despliegue, lógica interna, consultas OTP, sincronización espejo de nómina y pipeline con Gemini AI del Bot de Telegram (este opera de forma externa y autónoma, actuando únicamente como un cliente seguro del endpoint de ingesta del monolito).
  * Gestión de nómina de personal o asignación de turnos médicos (se consume el estado de empleados de forma estricta mediante sincronización asíncrona con el sistema central de RRHH).

## 1.3. Reglas de Negocio Globales

* **Dependencia Operativa Local:** El sistema web y su motor relacional PostgreSQL deben funcionar al 100% dentro de la red de área local (LAN) hospitalaria. La caída de internet solo deshabilitará la ingesta externa del Bot (por depender de APIs externas), manteniendo intacta la operatividad del taller técnico web.
* **Principio de Inmutabilidad Relacional (Soft-Deletes):** Ninguna tabla del sistema operativo (Pre-órdenes, Órdenes, Dispositivos, Empleados, Áreas) permite la ejecución del comando físico `DELETE`. Los descartes de información se manejan mediante mutaciones de estado (`RECHAZADA`, `Desincorporado`, `Inactivo`).
* **Priorización por Criticidad Hospitalaria:** Las solicitudes de servicio se ordenan de forma obligatoria según el nivel de urgencia, donde las áreas de preservación de la vida (Emergencia, UCI, quirófanos) se indexan con máxima prioridad en los tableros de trabajo de los técnicos.

## 1.4. Glosario de Términos

* **Pre-orden:** Registro crudo e intermedio almacenado en el búfer de entrada que contiene los datos procesados por la IA del Bot externo a la espera de validación humana.
* **Orden Activa:** Incidencia formalmente vinculada a un dispositivo del inventario y asignada a un especialista para su resolución de campo.
* **Sesión Híbrida:** Mecanismo de autenticación donde el token JWT se convalida contra una tabla de estados físicos en la base de datos para permitir la revocación inmediata de accesos.
* **Patrón Outbox:** Patrón de arquitectura que garantiza la consistencia de eventos guardando las notificaciones salientes en la base de datos dentro de la misma transacción del negocio, desacoplándolo del servicio de envío (SMTP).
* **Diff Log:** Registro de auditoría optimizado que guarda únicamente la diferencia exacta de los campos mutados en formato JSONB, evitando la duplicación del registro completo.
* **Aging (Envejecimiento):** Métrica temporal que calcula las horas que un ticket permanece sin solución operativa para disparar alarmas de escalabilidad.
