# Script de PowerShell para levantar el ambiente completo localmente
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "   PREPARANDO SERVIDORES LOCALES (HOSPITAL)   " -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

# 1. Crear entorno virtual de Python si no existe
if (-not (Test-Path "backend/venv")) {
    Write-Host "[1/3] Creando entorno virtual Python (venv) en backend..." -ForegroundColor Yellow
    python -m venv backend/venv
} else {
    Write-Host "[1/3] Entorno virtual Python (venv) ya existe." -ForegroundColor Yellow
}

# 2. Instalar dependencias del backend
Write-Host "[2/3] Descargando e instalando requerimientos de Python..." -ForegroundColor Yellow
& backend/venv/Scripts/pip install -r backend/requirements.txt

# 3. Lanzar servidores concurrentemente en terminales separadas
Write-Host "[3/3] Lanzando servidores en ventanas independientes..." -ForegroundColor Yellow

# Lanzar FastAPI
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd backend; & venv/Scripts/uvicorn main:app --host 0.0.0.0 --port 8000"

# Lanzar Vite Frontend
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd frontend; npm run dev"

Write-Host "=============================================" -ForegroundColor Green
Write-Host " ¡Listo! Se han abierto 2 ventanas: " -ForegroundColor Green
Write-Host " - Backend corriendo en: http://localhost:8000" -ForegroundColor Green
Write-Host " - Frontend corriendo en: http://localhost:5173" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green
