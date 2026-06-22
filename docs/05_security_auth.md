# 5. CATEGORÍA: Seguridad, Autenticación y Sesiones

## 5.1. Estrategia de Autenticación

* **Interfaz Web Dashboard:** Proveedor de identidad externo federado basado en **Google Delegated Authentication (Google SSO)**. El flujo intercepta el correo electrónico emitido en el perfil verificado y restringe de manera estricta que pertenezca al dominio corporativo del hospital (`@hospital.local` o variante autorizada).
* **Interfaz Bot de Telegram:** Autenticación de doble factor basada en posesión de identidad (**OTP**). El sistema exige la cédula del solicitante externo, valida su condición de empleado `Activo` en la base de datos de nómina y despacha una clave numérica de un solo uso por los canales tradicionales vinculados en su ficha. La introducción correcta en la UI de mensajería asocia permanentemente su ID de Telegram.

## 5.2. Ciclo de Vida de la Sesión

El monolito implementa una arquitectura de **Sesión Híbrida**. Tras la validación exitosa de Google SSO, el backend inserta un UUID aleatorio (`jti`) en la tabla `auth_sessions` asociado al ID del usuario web, y procede a firmar un token JWT simétrico de corta duración (Expiración: 8 horas) que viaja en las cabeceras HTTP (`Authorization: Bearer <JWT>`).

Cada endpoint protegido por FastAPI inyecta una dependencia que abre la base de datos y ejecuta la comprobación:

```sql
SELECT activa FROM auth_sessions WHERE token_jti = :jti AND usuario_id = :user_id;
```

Si el query retorna `FALSE` (debido a que el Admin ejecutó una suspensión en tiempo real sobre el técnico), el backend aborta el flujo e inyecta inmediatamente una excepción HTTP `401 Unauthorized`, invalidando el token del cliente web al instante.

## 5.3. Modelo de Autorización (RBAC)

| Endpoint / Módulo | Admin | Soporte Técnico (ST) | Técnico TH / TS | Aspirante |
| --- | --- | --- | --- | --- |
| `/api/v1/areas/**` [CRUD Áreas] | **Escritura / Lectura** | Solo Lectura | Solo Lectura | Sin Acceso |
| `/api/v1/auth/validate` [Aspirantes] | **Escritura / Lectura** | Sin Acceso | Sin Acceso | Solo Escritura (Formulario) |
| `/api/v1/incidencias/ingest` [Ingesta] | Sin Acceso (API Key) | Sin Acceso (API Key) | Sin Acceso (API Key) | Sin Acceso (API Key) |
| `/api/v1/incidencias/pre` [Bandeja ST] | Solo Lectura | **Escritura / Lectura** | Sin Acceso | Sin Acceso |
| `/api/v1/incidencias/active/**` [Tickets] | Solo Lectura | Escritura / Lectura | **Escritura / Lectura** | Sin Acceso |
| `/api/v1/devices/patrimonio` [Bajas] | **Escritura / Lectura** | Sin Acceso | Sin Acceso | Sin Acceso |
| `/api/v1/inventory/items` [Almacén] | Escritura / Lectura | Escritura / Lectura | Solo Lectura (Consumo) | Sin Acceso |
| `/api/v1/inventory/prestamos` [Herramientas] | **Escritura / Lectura** | **Escritura / Lectura** | Solo Lectura | Sin Acceso |
| `/api/v1/reports/**` [Módulo Analítico] | **Escritura / Lectura** | Solo Lectura | Sin Acceso | Sin Acceso |
| `/api/v1/audit/logs` [Logs Diff] | **Solo Lectura** | Sin Acceso | Sin Acceso | Sin Acceso |
| `/api/v1/config/**` [Fila Única] | **Escritura / Lectura** | Sin Acceso | Sin Acceso | Sin Acceso |
