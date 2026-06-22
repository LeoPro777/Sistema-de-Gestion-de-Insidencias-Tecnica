FROM python:3.11-slim

# Instalar utilidades de red necesarias para la prueba de Ping
RUN apt-get update && apt-get install -y --no-install-recommends \
    iputils-ping \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiar e instalar requerimientos
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar el código del backend al contenedor
COPY . .

# Exponer el puerto del servidor HTTP FastAPI
EXPOSE 8000

# Lanzar el servidor Uvicorn apuntando a main.py
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", 8000]
