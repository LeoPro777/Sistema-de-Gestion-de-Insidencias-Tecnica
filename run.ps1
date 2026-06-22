# Levantar servidores locales (FastAPI y Vite) sin instalar dependencias
Write-Host "Iniciando servidores del taller hospitalario..." -ForegroundColor Cyan

# Lanzar FastAPI Backend
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd backend; & venv/Scripts/uvicorn main:app --host 0.0.0.0 --port 8000"

# Lanzar Vite Frontend
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd frontend; npm run dev"

# Lanzar Monitor del Bot (Relay Webhook Local)
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd backend; & venv/Scripts/python local_bot_relay.py"

Write-Host "¡Servidores lanzados con éxito!" -ForegroundColor Green
Write-Host " - Backend: http://localhost:8000"
Write-Host " - Frontend: http://localhost:5173"
Write-Host " - Bot Monitor: Consola independiente activa escuchando mensajes"
