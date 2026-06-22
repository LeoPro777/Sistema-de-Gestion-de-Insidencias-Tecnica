-- --- INYECCIÓN DEL CATÁLOGO INICIAL DE ÁREAS HOSPITALARIAS ---
INSERT INTO areas_hospital (nombre, descripcion) VALUES 
('Emergencia Adultos', 'Unidad de atención crítica de shock room e ingresos inmediatos.'),
('Unidad de Cuidados Intensivos (UCI)', 'Área de alta complejidad y monitoreo vital continuo.'),
('Radiología e Imágenes', 'Departamento de diagnóstico por tomografía, rayos X y resonancias.'),
('Laboratorio Central', 'Procesamiento de muestras e inmunoanálisis químico.'),
('Administración Central', 'Oficinas de control de gestión, facturación y recursos humanos.');

-- --- INYECCIÓN DE FILA ÚNICA OBLIGATORIA DE CONFIGURACIONES GLOBALES ---
INSERT INTO configuraciones_sistema (correo_bienes_institucional, smtp_server_config, tiempo_max_prestamo_herramientas, dias_retencion_audios, dias_retencion_auditoria) VALUES 
('bienes.patrimonio@hospital.gob', '{"server": "mail.hospital.local", "port": 587, "user": "alertas@hospital.local", "cipher": "tls"}', 24, 30, 365);

-- --- INYECCIÓN DE CUENTAS DE NÓMINA (EMPLEADOS) ---
INSERT INTO empleados (cedula, telegram_id, nombre, apellido, estado, datos_contacto) VALUES 
('V-00000000', NULL, 'Administrador', 'General', 'Activo', '{"email": "admin.soporte@hospital.local", "telefono": "+584120000000"}'),
('V-11111111', '109283746', 'Freddy', 'Perez', 'Activo', '{"email": "freddy.perez@hospital.local", "telefono": "+584121111111"}'),
('V-22222222', NULL, 'Maria', 'Gomez', 'Activo', '{"email": "maria.gomez@hospital.local", "telefono": "+584122222222"}'),
('V-33333333', NULL, 'Juan', 'Rodriguez', 'Activo', '{"email": "juan.rodriguez@hospital.local", "telefono": "+584123333333"}');

-- --- VINCULACIÓN DE USUARIOS WEB MONOLITO ---
INSERT INTO usuarios (email, cedula, nombre, apellido, rol, estado) VALUES 
('admin.soporte@hospital.local', 'V-00000000', 'Administrador', 'General', 'Admin', 'ACEPTADO'),
('freddy.perez@hospital.local', 'V-11111111', 'Freddy', 'Perez', 'Soporte Técnico', 'ACEPTADO'),
('maria.gomez@hospital.local', 'V-22222222', 'Maria', 'Gomez', 'Técnico Hardware', 'ACEPTADO'),
('juan.rodriguez@hospital.local', 'V-33333333', 'Juan', 'Rodriguez', 'Técnico Software', 'ACEPTADO');

-- --- INYECCIÓN DE ÍTEMS EN INVENTARIO DEL TALLER ---
INSERT INTO inventario_departamento (nombre, tipo, stock, stock_minimo) VALUES
-- Consumibles (descontables automáticamente)
('Conectores RJ45 Blindados Cat6', 'Consumible', 50, 10),
('Estaño para Soldar 1mm (tubo)', 'Consumible', 15, 3),
('Pasta Térmica Arctic MX-4 4g', 'Consumible', 10, 2),
('Cable UTP Cat6 100% Cobre (metros)', 'Consumible', 305, 50),
('Cinta Aislante 3M', 'Consumible', 8, 2),
-- Herramientas (prestables)
('Cautín Profesional regulable Weller', 'Herramienta', 3, 1),
('Tester de Red RJ45 Fluke LinkIQ', 'Herramienta', 2, 1),
('Destornillador Inalámbrico Bosch Go 2', 'Herramienta', 4, 1),
('Crimpadora RJ45/RJ11 Pro', 'Herramienta', 5, 2);

-- --- INYECCIÓN DE DISPOSITIVOS MAESTROS ---
INSERT INTO dispositivos (codigo_activo, serial, mac_address, ip_fija, marca, area_id, descripcion, estado_patrimonial) VALUES
('HOSP-001', 'SN1234567890', '00:1A:2B:3C:4D:5E', '192.168.1.100', 'HP ProDesk 600', 1, 'Equipo del shock room de Emergencia Adultos', 'Activo'),
('HOSP-002', 'SN0987654321', '00:1A:2B:3C:4D:5F', '192.168.1.101', 'Dell OptiPlex 3080', 2, 'Servidor de monitoreo UCI', 'Activo'),
('HOSP-003', 'SN1122334455', '00:1A:2B:3C:4D:6A', '192.168.1.102', 'Lenovo ThinkCentre M70q', 3, 'PC de visualización de Tomografías', 'Activo');
