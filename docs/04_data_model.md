# 4. CATEGORÍA: Modelo y Estado de Datos

## 4.1. Motor de Base de Datos

El sistema utiliza estrictamente el motor de base de datos relacional **PostgreSQL (versión 15+)** debido a su soporte nativo avanzado para el tipo de datos JSONB, consultas de agregación complejas, indexación compuesta y aislamiento transaccional robusto para operaciones concurrentes de inventario informático hospitalario.

## 4.2. Esquema Detallado (Tablas DDL de Producción)

```sql
-- --- ENUMS Y TIPOS PERSONALIZADOS ---
CREATE TYPE un_rol AS ENUM ('Admin', 'Soporte Técnico', 'Técnico Hardware', 'Técnico Software', 'Aspirante');
CREATE TYPE un_estado_usuario AS ENUM ('PENDIENTE', 'ACEPTADO', 'RECHAZADO');
CREATE TYPE un_estado_orden AS ENUM ('PRE_ORDEN', 'ASIGNADA', 'EN_PROCESO', 'RESUELTA', 'RECHAZADA');
CREATE TYPE un_tipo_item AS ENUM ('Consumible', 'Herramienta');
CREATE TYPE un_estado_prestamo AS ENUM ('Activo', 'Devuelto', 'Retrasado', 'Dañado', 'Perdido');
CREATE TYPE una_urgencia AS ENUM ('Crítica', 'Alta', 'Media', 'Baja');

-- --- TABLA: ÁREAS DEL HOSPITAL (MÓDULO DE ÁREAS) ---
CREATE TABLE areas_hospital (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) UNIQUE NOT NULL,
    descripcion TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- --- TABLA: EMPLEADOS (RRHH / HISTORIAL GLOBAL) ---
CREATE TABLE empleados (
    cedula VARCHAR(20) PRIMARY KEY,
    telegram_id VARCHAR(100) UNIQUE,
    nombre VARCHAR(100) NOT NULL,
    apellido VARCHAR(100) NOT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'Activo',
    datos_contacto JSONB NOT NULL,                 -- Estructura: { "email": "...", "telefono": "..." }
    otp_hash VARCHAR(64),
    otp_expiracion TIMESTAMP,
    intentos_fallidos INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- --- TABLA: USUARIOS (SISTEMA WEB MONOLITO) ---
CREATE TABLE usuarios (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    cedula VARCHAR(20) UNIQUE REFERENCES empleados(cedula) ON DELETE SET NULL,
    nombre VARCHAR(100) NOT NULL,
    apellido VARCHAR(100) NOT NULL,
    rol un_rol NOT NULL DEFAULT 'Aspirante',
    estado un_estado_usuario NOT NULL DEFAULT 'PENDIENTE',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- --- TABLA: CONTROL HÍBRIDO DE SESIONES (REVOCACIÓN INMEDIATA) ---
CREATE TABLE auth_sessions (
    id SERIAL PRIMARY KEY,
    usuario_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    token_jti VARCHAR(255) UNIQUE NOT NULL,
    activa BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- --- TABLA: DISPOSITIVOS (INVENTARIO TECNOLÓGICO) ---
CREATE TABLE dispositivos (
    id SERIAL PRIMARY KEY,
    codigo_activo VARCHAR(50) UNIQUE NOT NULL,
    serial VARCHAR(100) UNIQUE NOT NULL,
    mac_address VARCHAR(17) UNIQUE,
    ip_fija VARCHAR(15),
    marca VARCHAR(100) NOT NULL,
    area_id INT NOT NULL REFERENCES areas_hospital(id) ON DELETE RESTRICT,
    descripcion TEXT,
    estado_patrimonial VARCHAR(50) NOT NULL DEFAULT 'Activo', 
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- --- TABLA: PRE_ORDENES / REPORTES (INGESTA DESDE TELEGRAM) ---
CREATE TABLE pre_ordenes (
    id SERIAL PRIMARY KEY,
    numero_reporte UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    telegram_id VARCHAR(100) NOT NULL REFERENCES empleados(telegram_id) ON DELETE RESTRICT,
    tipo_requerimiento VARCHAR(100) NOT NULL,                              
    area_id INT NOT NULL REFERENCES areas_hospital(id) ON DELETE RESTRICT,  
    urgencia una_urgencia NOT NULL DEFAULT 'Media',                        
    resumen TEXT NOT NULL,
    audio_path VARCHAR(512),                                               
    estado un_estado_orden NOT NULL DEFAULT 'PRE_ORDEN',
    device_id INT REFERENCES dispositivos(id) ON DELETE SET NULL,          
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- --- TABLA: ÓRDENES DE SERVICIO ACTIVAS ---
CREATE TABLE ordenes (
    id SERIAL PRIMARY KEY,
    pre_orden_id INT UNIQUE REFERENCES pre_ordenes(id) ON DELETE CASCADE,
    device_id INT NOT NULL REFERENCES dispositivos(id) ON DELETE CASCADE,
    tecnico_id INT REFERENCES usuarios(id) ON DELETE SET NULL,             
    soporte_id INT NOT NULL REFERENCES usuarios(id),                       
    estado un_estado_orden NOT NULL DEFAULT 'ASIGNADA',
    diagnostico TEXT,
    solucion_parametrica VARCHAR(150),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMP
);

-- --- TABLA: INVENTARIO INTERNO DEL DEPARTAMENTO TÉCNICO ---
CREATE TABLE inventario_departamento (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    tipo un_tipo_item NOT NULL,
    stock INT NOT NULL DEFAULT 0 CONSTRAINT check_stock_positivo CHECK (stock >= 0),
    stock_minimo INT NOT NULL DEFAULT 5,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- --- TABLA INTERMEDIA: CONSUMIBLES POR ÓRDEN (CIERRE TÉCNICO) ---
CREATE TABLE orden_consumibles (
    orden_id INT REFERENCES ordenes(id) ON DELETE CASCADE,
    consumible_id INT REFERENCES inventario_departamento(id) ON DELETE RESTRICT,
    cantidad INT NOT NULL CONSTRAINT check_cantidad_positiva CHECK (cantidad > 0),
    PRIMARY KEY (orden_id, consumible_id)
);

-- --- TABLA: PRÉSTAMOS DE HERRAMIENTAS INTERNAS (ESTRUCTURA DUAL) ---
CREATE TABLE prestamos_herramientas (
    id SERIAL PRIMARY KEY,
    herramienta_id INT NOT NULL REFERENCES inventario_departamento(id) ON DELETE RESTRICT,
    autorizador_id INT NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT, 
    beneficiario_cedula VARCHAR(20) NOT NULL REFERENCES empleados(cedula) ON DELETE RESTRICT, 
    fecha_prestamo TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_devolucion_estimada TIMESTAMP NOT NULL,
    fecha_devolucion_real TIMESTAMP,
    estado un_estado_prestamo NOT NULL DEFAULT 'Activo'
);

-- --- TABLA: TRASLADOS Y DESINCORPORACIONES (CONTROL PATRIMONIAL) ---
CREATE TABLE traslados (
    id SERIAL PRIMARY KEY,
    device_id INT NOT NULL REFERENCES dispositivos(id) ON DELETE CASCADE,
    area_origen_id INT NOT NULL REFERENCES areas_hospital(id) ON DELETE RESTRICT,
    area_destino_id INT NOT NULL REFERENCES areas_hospital(id) ON DELETE RESTRICT,
    motivo_traslado TEXT NOT NULL,                                         
    ejecutor_id INT NOT NULL REFERENCES usuarios(id),                       
    tipo_movimiento VARCHAR(50) NOT NULL,                                  
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- --- TABLA: CONFIGURACIONES GLOBALES DEL SISTEMA (REGISTRO ÚNICO) ---
CREATE TABLE configuraciones_sistema (
    id SERIAL PRIMARY KEY,
    correo_bienes_institucional VARCHAR(255) NOT NULL,
    smtp_server_config JSONB NOT NULL,
    tiempo_max_prestamo_herramientas INT NOT NULL DEFAULT 24,
    dias_retencion_audios INT NOT NULL DEFAULT 30,
    dias_retencion_auditoria INT NOT NULL DEFAULT 365,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- --- TABLA: COLA DE MENSAJERÍA OUTBOX ---
CREATE TABLE cola_correos_outbox (
    id SERIAL PRIMARY KEY,
    destinatario VARCHAR(255) NOT NULL,
    asunto VARCHAR(200) NOT NULL,
    cuerpo_html TEXT NOT NULL,
    procesado BOOLEAN NOT NULL DEFAULT FALSE,
    intentos INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- --- TABLA: ALERTAS ENRUTADAS POR ROL ---
CREATE TABLE alertas_sistema (
    id SERIAL PRIMARY KEY,
    mensaje TEXT NOT NULL,
    destinatario_rol un_rol NOT NULL DEFAULT 'Soporte Técnico',            
    leida BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- --- TABLA: LOGS DE AUDITORÍA INMUTABLE ---
CREATE TABLE auditoria_logs (
    id SERIAL PRIMARY KEY,
    usuario_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
    rol_ejecutor VARCHAR(50) NOT NULL,
    accion_ejecutada VARCHAR(100) NOT NULL,
    tabla_afectada VARCHAR(100) NOT NULL,
    registro_id INT NOT NULL,
    snapshot_cambio JSONB NOT NULL,                                        
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- --- RESTRICCIÓN DE INMUTABILIDAD Y ASIGNACIÓN DE ÍNDICES COMPUESTOS ---
REVOKE UPDATE, DELETE ON TABLE auditoria_logs FROM public;

CREATE INDEX idx_reporte_traslados_filtros ON traslados (area_destino_id, area_origen_id, ejecutor_id, created_at);
CREATE INDEX idx_reporte_ordenes_urgencia ON pre_ordenes (urgencia, estado, created_at);
CREATE INDEX idx_ordenes_kpis ON ordenes (estado, created_at, closed_at);
CREATE INDEX idx_alertas_admin ON alertas_sistema (destinatario_rol, leida, created_at);
```

## 4.3. Relaciones y Cardinalidad

* `areas_hospital` **(1:N)** `dispositivos`: Un área hospitalaria resguarda múltiples activos informáticos; un dispositivo pertenece estrictamente a un área geográfica.
* `usuarios` **(1:N)** `ordenes`: Un usuario de Soporte Técnico puede despachar y promover N pre-órdenes; un técnico de campo puede asumir N órdenes de trabajo asignadas.
* `dispositivos` **(1:N)** `pre_ordenes` / `ordenes`: Una computadora recopila un historial clínico e intervenciones secuenciales a lo que dure su ciclo de vida institucional.
* `ordenes` **(1:1)** `pre_ordenes`: Una orden de servicio activa nace de forma obligatoria de una única pre-orden depurada y promovida de la bandeja de entrada.
* `ordenes` **(N:M)** `inventario_departamento` a través de `orden_consumibles`: Una orden técnica de reparación consume múltiples repuestos y materiales del taller, y un consumible específico se distribuye en múltiples intervenciones.

## 4.4. Seeders (Datos Iniciales Mandatorios)

```sql
-- Inyección del Catálogo Inicial Base de Áreas Hospitalarias
INSERT INTO areas_hospital (nombre, descripcion) VALUES 
('Emergencia Adultos', 'Unidad de atención crítica de shock room e ingresos inmediatos.'),
('Unidad de Cuidados Intensivos (UCI)', 'Área de alta complejidad y monitoreo vital continuo.'),
('Radiología e Imágenes', 'Departamento de diagnóstico por tomografía, rayos X y resonancias.'),
('Laboratorio Central', 'Procesamiento de muestras e inmunoanálisis químico.'),
('Administración Central', 'Oficinas de control de gestión, facturación y recursos humanos.');

-- Inyección de Fila Única Obligatoria de Configuraciones Globales
INSERT INTO configuraciones_sistema (correo_bienes_institucional, smtp_server_config, tiempo_max_prestamo_herramientas, dias_retencion_audios, dias_retencion_auditoria) VALUES 
('bienes.patrimonio@hospital.gob', '{"server": "mail.hospital.local", "port": 587, "user": "alertas@hospital.local", "cipher": "tls"}', 24, 30, 365);

-- Inyección de Cuenta de Empleado Maestro de Nómina para el Administrador
INSERT INTO empleados (cedula, nombre, apellido, estado, datos_contacto) VALUES 
('V-00000000', 'Administrador', 'General', 'Activo', '{"email": "admin.soporte@hospital.local", "telefono": "+584120000000"}');

-- Vinculación de la Cuenta de Usuario Maestro con Rol de Admin
INSERT INTO usuarios (email, cedula, nombre, apellido, rol, estado) VALUES 
('admin.soporte@hospital.local', 'V-00000000', 'Administrador', 'General', 'Admin', 'ACEPTADO');
```
