# 6. CATEGORÍA: Contratos de Integración y API

## 6.1. Especificación de Endpoints / Tópicos

### Endpoint I: Ingesta Externa de Incidencias

* **Ruta:** `/api/v1/incidencias/ingest`
* **Método HTTP:** `POST`
* **Seguridad:** Cabecera HTTP `X-API-Key` obligatoria.

### Endpoint II: Registro de Formulario de Aspirante

* **Ruta:** `/api/v1/auth/register-aspirante`
* **Método HTTP:** `POST`
* **Seguridad:** JWT restringido (`scope: aspirante`).

### Endpoint III: Cierre Técnico Obligatorio de Orden

* **Ruta:** `/api/v1/incidencias/active/{id}/close`
* **Método HTTP:** `PUT`
* **Seguridad:** JWT operativo (`rol: Técnico Hardware` o `Técnico Software`).

## 6.2. Contrato de Entrada (Payload JSON)

### Payload para `/api/v1/incidencias/ingest`:

```json
{
  "telegram_id": "109283746",
  "tipo_requerimiento": "Hardware",
  "area_id": 2,
  "urgencia": "Crítica",
  "resumen": "La pantalla de monitoreo de signos vitales de la cama 3 parpadea y se apaga de forma intermitente.",
  "audio_base64_payload": "RIFBQ0...truncated...bW9kZQ=="
}
```

### Payload para `/api/v1/incidencias/active/{id}/close`:

```json
{
  "diagnostico": "Se evidenció sulfatación severa en los pines del conector de alimentación de la tarjeta inversora de la pantalla médica.",
  "solucion_parametrica": "Mantenimiento correctivo químico y soldadura de componentes de hardware",
  "consumibles_utilizados": [
    {
      "consumible_id": 14,
      "cantidad": 1
    },
    {
      "consumible_id": 3,
      "cantidad": 2
    }
  ]
}
```

## 6.3. Contrato de Salida Exitosa

### Respuesta Exitosa de Ingesta (`211 Created`):

```json
{
  "status": "success",
  "message": "Incidencia cruda capturada con éxito en el búfer hospitalario",
  "data": {
    "numero_reporte": "cfb7d3a4-1298-4b71-acde-8812938472af",
    "estado": "PRE_ORDEN",
    "created_at": "2026-06-20T19:15:32Z"
  }
}
```

### Respuesta Exitosa de Cierre Técnico (`200 OK`):

```json
{
  "status": "success",
  "message": "Orden de servicio cerrada de forma exitosa. Historial clínico actualizado.",
  "data": {
    "orden_id": 412,
    "estado": "RESUELTA",
    "closed_at": "2026-06-20T19:18:00Z"
  }
}
```

## 6.4. Catálogo de Errores Estándar

### Error por Conflicto de Stock / Fallback a Borrador (`409 Conflict`):

```json
{
  "error_code": "INVENTORY_STOCK_EXHAUSTED",
  "message": "La operación transaccional no pudo completarse debido a desabastecimiento físico en el taller.",
  "details": {
    "item_id": 14,
    "nombre_solicitado": "Conectores RJ45 Blindados Cat6",
    "stock_disponible": 0,
    "cantidad_solicitada": 2
  },
  "action_required": "Habilitar guardado de contingencia en Borrador Técnico en el cliente web."
}
```

### Error por Token Inválido o Usuario Suspendido (`401 Unauthorized`):

```json
{
  "error_code": "AUTHENTICATION_SESSION_REVOKED",
  "message": "Las credenciales de acceso suministradas ya no cuentan con una sesión activa en la base de datos.",
  "timestamp": "2026-06-20T19:19:01Z"
}
```
