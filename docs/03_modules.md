# 3. CATEGORÍA: Especificación Modular y Requerimientos

### MÓDULO 1: AUTENTICACIÓN, GESTIÓN DE ACCESO Y SESIONES HÍBRIDAS

* **Requerimientos Funcionales:**
  * Autenticar usuarios mediante Google SSO institucional.
  * Interceptar cuentas nuevas sin rol, registrar sus datos con estado `PENDIENTE` e inmovilizar la interfaz.
  * Mantener un canal WebSocket para conmutar la pantalla del Aspirante en tiempo real al ser aprobado por el Admin.
  * Permitir que un Aspirante con estado `RECHAZADO` vuelva a postularse limpiamente en su próximo inicio de sesión.
  * Validar la sesión híbrida en la tabla `auth_sessions` en cada endpoint protegido para permitir la expulsión inmediata de técnicos suspendidos.

* **Flujo de Datos / Algoritmo:**
  1. Usuario inicia sesión -> Google devuelve payload de perfil verificado.
  2. Backend busca el correo en la tabla `usuarios`.
  3. Si no existe -> Inserta usuario con estado `PENDIENTE`, guarda sesión inactiva y responde código de redirección forzosa al formulario de Aspirante. El frontend abre WebSocket a `/api/v1/auth/ws/status`.
  4. Si existe y está `ACEPTADO` -> Inserta fila en `auth_sessions` con un UUID único (`token_jti`), genera JWT conteniendo el `jti` y da acceso al Dashboard.

* **Wireframe / UI Concept:** Interfaz minimalista de bloqueo de pantalla con un indicador de carga animado continuo y un mensaje de advertencia centralizado: *"Su solicitud de acceso para el taller de soporte informático se encuentra en proceso de validación por la administración del hospital. Esta pantalla se actualizará automáticamente."*

---

### MÓDULO 2: CONFIGURACIÓN GLOBAL DEL SISTEMA Y VARIABLES OPERATIVAS

* **Requerimientos Funcionales:**
  * Garantizar la edición de los parámetros de red SMTP y el Correo de Bienes Institucionales con acceso exclusivo del Admin.
  * Persistir los valores límites de retención (Días de resguardo de audios y logs de auditoría).
  * Almacenar las preferencias visuales de usabilidad individual (escalabilidad de fuentes para el taller).

* **Flujo de Datos / Algoritmo:**
  1. Admin accede al formulario de configuraciones globales.
  2. Backend ejecuta un query de tipo `UPDATE` restringido a la clave primaria fija `id = 1` de la tabla `configuraciones_sistema`.
  3. Las preferencias ergonómicas de la UI no tocan el backend; React las inyecta en el *LocalStorage* del navegador modificando las variables del tema CSS (Root variables) al instante.

* **Wireframe / UI Concept:** Formulario estructurado en secciones colapsables (Sección I: Correo Institucional y Servidor de Alertas, Sección II: Políticas de Retención de Almacenamiento). Cada campo cuenta con textos explicativos inferiores de la variable del entorno.

---

### MÓDULO 3: CATÁLOGO CENTRALIZADO DE ÁREAS HOSPITALARIAS

* **Requerimientos Funcionales:**
  * Permitir el CRUD completo de las dependencias físicas de la institución con acceso exclusivo del Administrador.
  * Garantizar la restricción dura de clave foránea en dispositivos y pre-órdenes, impidiendo el uso de campos de texto libre para definir ubicaciones.

* **Flujo de Datos / Algoritmo:**
  1. Admin añade un nuevo departamento (ej. *Unidad de Cuidados Intensivos (UCI)*).
  2. Base de datos valida unicidad del nombre e inserta el registro devolviendo un `area_id` secuencial numérico.
  3. Al listar dispositivos o procesar pre-órdenes, el backend fuerza la selección mediante componentes tipo *Dropdown* vinculados a este listado indexado.

* **Wireframe / UI Concept:** Panel administrativo clásico con tabla de datos a la izquierda conteniendo el nombre y descripción del área, y formulario lateral derecho de creación ágil con validación de campos en tiempo real.

---

### MÓDULO 4: INGESTA EXTERNA Y BÚFER DE PRE-ÓRDENES

* **Requerimientos Funcionales:**
  * Ingestar de forma segura incidencias empaquetadas desde el Bot externo mediante autenticación por `X-API-Key`.
  * Almacenar físicamente los archivos binarios de notas de voz en la ruta local `/var/media/audios/` del servidor monolito.
  * Emitir una notificación de alta prioridad vía WebSockets a todo el rol de Soporte Técnico al recibir una pre-orden nueva.
  * Permitir que el Soporte Técnico edite por completo y de forma única la pre-orden (Área, Requerimiento, Urgencia, Resumen) antes de promoverla, o marcarla como `RECHAZADA` (Soft-Delete) si es spam.

* **Flujo de Datos / Algoritmo:**
  1. Endpoint `/ingest` recibe cabecera HTTP con la API Key y un objeto JSON de incidencia conteniendo la data procesada por la IA y el archivo de voz codificado.
  2. Backend guarda el audio en disco, genera un UUID de reporte institucional e inserta la fila en `pre_ordenes`.
  3. El backend toma el pool de conexiones de WebSockets y despacha un mensaje en broadcast a los operadores de Soporte Técnico conectados.

* **Wireframe / UI Concept:** Bandeja de entrada tipo buzón de correo. Muestra las incidencias entrantes en una lista vertical con etiquetas de color según la urgencia de la IA. Al hacer clic, despliega la información cruda, un reproductor nativo HTML5 para escuchar la nota de voz original del empleado y un formulario editable para refinar los datos.

---

### MÓDULO 5: GESTIÓN Y DESPACHO DE ÓRDENES DE SERVICIO ACTIVAS

* **Requerimientos Funcionales:**
  * Promover pre-órdenes depuradas a la tabla de órdenes de forma atómica en estado `ASIGNADA`, asociando el ID del técnico (TH/TS) responsable.
  * Ordenar visualmente los tableros técnicos de React según la prioridad hospitalaria (`Crítica` a `Baja`).
  * Activar alarmas de Envejecimiento (*Aging*) si un ticket excede el tiempo límite de resolución sin ser cerrado.
  * Permitir la acción "Devolver a Soporte Técnico" si el especialista determina que el caso fue mal clasificado, bloqueando la edición directa del tipo de orden por parte del técnico de campo.
  * Exigir de manera mandatoria los campos del formulario finalizador para transicionar la orden a estado `RESUELTA`.

* **Flujo de Datos / Algoritmo:**
  1. Soporte Técnico promueve el caso -> Transacción atómica elimina la fila del búfer de pre-órdenes (o cambia su estado) e inserta el registro en la tabla `ordenes` asignando el técnico.
  2. Un daemon asíncrono evalúa la tabla cada 5 minutos computando `NOW() - created_at`. Si excede el umbral según la criticidad, escribe una advertencia en la tabla de alertas operativas.
  3. Al rellenar el finalizador, un trigger procesa la inserción en `orden_consumibles` y actualiza la ficha del equipo informático.

* **Wireframe / UI Concept:** Tablero operativo tipo Kanban con cuatro columnas principales (`ASIGNADA`, `EN_PROCESO`, `RESUELTA`, `RECHAZADA`). Las tarjetas de las órdenes muestran indicadores visuales intermitentes (parpadeo rojo) si se activa la alerta de envejecimiento (*Aging*).

---

### MÓDULO 6: INVENTARIO FÍSICO DEL DEPARTAMENTO TÉCNICO (TALLER)

* **Requerimientos Funcionales:**
  * Controlar existencias divididas de forma estricta entre `Consumible` y `Herramienta`.
  * Descontar automáticamente materiales mediante triggers relacionales al cerrar órdenes.
  * Capturar excepciones de stock negativo de PostgreSQL, bloqueando la caída de la app y activando el guardado en **Borrador Técnico** en React.
  * Gestionar préstamos de herramientas mediante estructura dual obligatoria: autorizado por usuario del sistema (Admin/ST) y recibido por empleado institucional (cédula validada de la nómina).
  * Garantizar el descuento del taller y el despacho de alertas directas al Administrador ante reportes de herramientas como `Dañado` o `Perdido`.

* **Flujo de Datos / Algoritmo:**
  1. Técnico envía cierre de orden -> Trigger evalúa `stock - cantidad`. Si el valor arroja $< 0$, el trigger emite un `RAISE EXCEPTION`.
  2. El backend intercepta el código de error SQL, frena el flujo definitivo y responde un JSON estructurado con código `409 Conflict` detallando el ítem desabastecido.
  3. React recibe el error, bloquea el cierre, abre una ventana flotante y resguarda la información técnica habilitando el botón "Guardar como Borrador Técnico" en la caché local o tabla alternativa.

* **Wireframe / UI Concept:** Panel de control de almacén con vista de cuadrícula para herramientas y consumibles. Cuenta con indicadores numéricos grandes en verde, amarillo o rojo según los niveles de stock. El formulario de préstamo incluye dos selectores predictivos independientes: *"Usuario Autorizador del Taller"* y *"Cédula del Empleado Beneficiario"*.

---

### MÓDULO 7: CONTROL PATRIMONIAL (TRASLADOS Y BAJAS DE DISPOSITIVOS)

* **Requerimientos Funcionales:**
  * Exponer la ficha técnica estructurada de las computadoras y laptops del hospital.
  * Ejecutar pruebas de red y conectividad (Pings) de forma asíncrona y exclusivamente **bajo demanda** al abrir el perfil individual del equipo.
  * Garantizar transacciones atómicas exclusivas del Administrador para la reubicación de áreas o desincorporaciones definitivas, exigiendo de forma obligatoria el registro del motivo de traslado.
  * Asegurar la consistencia del envío del acta digital de traslado a Bienes Institucionales utilizando el Patrón Outbox.

* **Flujo de Datos / Algoritmo:**
  1. Admin ejecuta traslado -> Abre bloque transaccional en PostgreSQL.
  2. Ejecuta `UPDATE` de la columna `area_id` en la tabla `dispositivos`.
  3. Ejecuta `INSERT` en la tabla `traslados` guardando la trazabilidad, origen, destino y motivo.
  4. Ejecuta `INSERT` en la tabla `cola_correos_outbox` con la estructura HTML del acta patrimonial.
  5. Se ejecuta el `COMMIT`. Un subproceso asíncrono lee la tabla Outbox de forma cíclica para enviar el correo a través de SMTP sin afectar el rendimiento de la base de datos.

* **Wireframe / UI Concept:** Expediente clínico de hardware. Muestra pestañas de información: Pestaña 1: Ficha técnica y botón interactivo *"Verificar Estado de Red Actual"*, Pestaña 2: Línea de tiempo cronológica (*Timeline*) de todas las intervenciones técnicas históricas sufridas por la máquina, Pestaña 3: Historial patrimonial de traslados de áreas del hospital.

---

### MÓDULO 8: MOTOR ANALÍTICO Y REPORTES AVANZADOS

* **Requerimientos Funcionales:**
  * Compilar el Reporte de Traslados y Desincorporaciones patrimoniales permitiendo filtros dinámicos cruzados por área, origen, destino, administrador ejecutor y rangos de fecha.
  * Calcular de forma nativa en base de datos los indicadores de rendimiento clave hospitalarios (MTTR).
  * Identificar de forma inteligente máquinas defectuosas mediante el algoritmo de Índice de Recurrencia Crítica (Fatiga de Hardware).
  * Generar descargas directas en formatos PDF y Excel estructurándose exclusivamente sobre flujos de memoria de servidor (`BytesIO`), prohibiendo la escritura de archivos basura en el disco del monolito.

* **Flujo de Datos / Algoritmo:**
  1. Admin solicita reporte con filtros cruzados.
  2. FastAPI concatena las condiciones y lanza la consulta utilizando índices compuestos optimizados.
  3. El backend inyecta los registros resultantes en librerías en memoria (`xlsxwriter` / `reportlab`), construye el archivo binario y lo retorna de inmediato al cliente React como una respuesta de flujo de datos estructurado (`StreamingResponse`).

* **Wireframe / UI Concept:** Dashboard ejecutivo con selectores superiores de filtros globales y botones de acción rápida para exportación (*"Exportar PDF"* / *"Exportar Excel"*). Las gráficas analíticas muestran la tasa de fallas y destacan en rojo las máquinas etiquetadas con fatiga crítica de componentes.

---

### MÓDULO 9: ALERTAS E INTEGRACIÓN DE EVENTOS DEL ENTORNO

* **Requerimientos Funcionales:**
  * Clasificar y distribuir de forma selectiva las notificaciones del sistema según el rol del usuario conectado.
  * Enrutar alertas operativas de tickets y envejecimiento (Aging) al pool de Soporte Técnico.
  * Enrutar alertas de desabastecimiento de insumos y siniestros de taller exclusivamente a la terminal del Administrador.
  * Garantizar la persistencia de las advertencias mediante almacenamiento físico, permitiendo el archivado visual de las mismas (Soft-Archive).

* **Flujo de Datos / Algoritmo:**
  1. Un Trigger de stock o siniestro se dispara -> Inserta fila en `alertas_sistema` asignando explícitamente el valor en la columna `destinatario_rol` como `'Admin'`.
  2. El backend filtra las notificaciones activas por WebSocket examinando el rol del token de sesión. El canal de comunicación transmite el evento únicamente a los administradores en línea.

* **Wireframe / UI Concept:** Centro de notificaciones flotante (Campana de alertas en la barra superior de navegación) dividido en pestañas de prioridad. Cada alerta cuenta con un botón interactivo de verificación con forma de check para archivar visualmente el mensaje de la vista del panel operativo.

---

### MÓDULO 10: AUDITORÍA MAESTRA E INMUTABILIDAD COMPUTACIONAL

* **Requerimientos Funcionales:**
  * Capturar de forma transparente y obligatoria toda alteración de registros en las tablas del sistema.
  * Optimizar el almacenamiento aislando de forma estricta los campos modificados en estructuras de diferencias (*Diffs*) bajo el formato JSONB de PostgreSQL.
  * Bloquear de forma definitiva e inmutable los privilegios de actualización y borrado sobre la bitácora a nivel del motor relacional de base de datos.

* **Flujo de Datos / Algoritmo:**
  1. Se ejecuta una operación de mutación de datos (`INSERT`, `UPDATE`) en tablas críticas.
  2. Un trigger global intercepta la acción antes del commit, ejecuta una función procedural que examina las diferencias entre las variables lógicas `OLD` y `NEW`, construye el Diff JSONB e inserta la línea en `auditoria_logs`.

* **Wireframe / UI Concept:** Visor de seguridad inmutable (solo accesible para el rol de Administrador). Muestra un visor de registros cronológicos estructurado donde los cambios de datos se renderizan visualmente comparando el valor antiguo y el valor nuevo resaltado en colores rojo y verde respectivamente.

---

### MÓDULO 11: PLANIFICADOR DE MANTENIMIENTO INTERNO (DAEMON ASÍNCRONO)

* **Requerimientos Funcionales:**
  * Ejecutar de forma automática tareas de mantenimiento a las 2:00 AM utilizando el planificador asíncrono nativo del monolito.
  * Depurar archivos físicos de notas de voz antiguos vinculados a reportes resueltos o rechazados basándose en los días configurados por el Admin.
  * Purgar filas históricas obsoletas de la tabla de auditoría inmutable para preservar la optimización de los índices relacionales.

* **Flujo de Datos / Algoritmo:**
  1. El planificador asíncrono interno alcanza la hora programada (2:00 AM).
  2. Consulta los días de retención vigentes en la tabla de configuraciones del sistema.
  3. Busca los registros de pre-ónden cerradas con antigüedad superior y ejecuta la llamada de sistema para eliminar el archivo binario del disco duro, actualizando la base de datos.
  4. Ejecuta un query de borrado masivo sobre `auditoria_logs` para filas antiguas bajo privilegios de sistema superiores, liberando espacio físico de almacenamiento.

* **Wireframe / UI Concept:** Módulo técnico invisible a nivel operativo. El Administrador visualiza únicamente en su panel de variables globales los indicadores informativos que declaran la última ejecución exitosa del Daemon de mantenimiento de fondo y el espacio de almacenamiento liberado en el servidor.
