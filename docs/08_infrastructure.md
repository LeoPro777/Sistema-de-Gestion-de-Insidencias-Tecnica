# 8. CATEGORÍA: Infraestructura, DevOps y Resiliencia

## 8.1. Entornos (Estructura del `.env`)

```ini
# Configuración del Entorno de Ejecución
ENVIRONMENT=production
SECRET_KEY=9a8b7c6d5e4f3g2h1i0j9k8l7m6n5o4p3q2r1s0t
BACKEND_CORS_ORIGINS=["http://localhost:5173", "http://hospital.local"]

# Conexión Persistente PostgreSQL
POSTGRES_SERVER=localhost
POSTGRES_USER=app_hospital_user
POSTGRES_PASSWORD=seguridad_encriptada_2026
POSTGRES_DB=hospital_incidentes_db
POSTGRES_PORT=5432

# Ingestor Externo Webhook
BOT_API_KEY=ingest_key_hospital_master_2026_prod

# Parámetros del Servidor de Correo Corporativo
SMTP_HOST=smtp.hospital.local
SMTP_PORT=587
SMTP_USER=alertas.inventario@hospital.local
SMTP_PASSWORD=password_correo_institucional
```

## 8.2. Containerización / Despliegue

El sistema se despliega en infraestructura local mediante contenedores independientes controlados por **Docker Compose**, aislando el entorno de red de la base de datos de los puertos expuestos de la LAN.

### Estructura del `docker-compose.yml` base:

```yaml
version: '3.8'

services:
  postgres_db:
    image: postgres:15-alpine
    container_name: hospital_postgres
    restart: always
    environment:
      POSTGRES_USER: app_hospital_user
      POSTGRES_PASSWORD: seguridad_encriptada_2026
      POSTGRES_DB: hospital_incidentes_db
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./database:/docker-entrypoint-initdb.d
    networks:
      - hospital_internal_network

  fastapi_backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: hospital_fastapi
    restart: always
    volumes:
      - /var/media/audios:/var/media/audios
    environment:
      - POSTGRES_SERVER=postgres_db
    ports:
      - "8000:8000"
    depends_on:
      - postgres_db
    networks:
      - hospital_internal_network

volumes:
  postgres_data:

networks:
  hospital_internal_network:
    driver: bridge
```

## 8.3. Mecanismo de Logs y Monitoreo

* **Logs Estructurados:** El backend monolítico desactiva el formateador de texto plano de Uvicorn y configura un formateador estructural basado en **JSON (Loguru / Python-Json-Logger)**. Cada línea de log impresa en la salida estándar (`stdout`) se registra como una línea JSON de un solo renglón conteniendo: `timestamp` con milisegundos, `level` (INFO, WARNING, ERROR), `module`, y el `payload` del mensaje de error, optimizando la lectura automática para centralizadores de logs.

## 8.4. Resiliencia de Red

* **Estrategia de WebSockets en React:** El hook personalizado `useWebSocket` implementa un algoritmo de **Reconexión con Respaldo Exponencial (*Exponential Backoff*)**. Ante micro-cortes de la red LAN hospitalaria, el cliente web no lanza una pantalla de error fatal; intenta reconectar tras 1 segundo, duplicando el intervalo de espera en cada intento fallido hasta un tope máximo de 30 segundos, manteniendo un estado visual de advertencia amarillo en la UI.
* **Políticas de Reintento Postal (Outbox):** El subproceso asíncrono encargado de vaciar la tabla `cola_correos_outbox` cuenta con un contador de intentos fallidos. Si el servidor SMTP del hospital rebota la conexión, el worker incrementa la columna `intentos = intentos + 1` y suspende el reenvío de esa fila específica por un margen de 15 minutos, evitando bloqueos de memoria y garantizando que el acta digital se entregue una vez se restablezca el servicio de correo.
