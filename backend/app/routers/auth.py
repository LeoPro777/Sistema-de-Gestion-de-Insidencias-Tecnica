from fastapi import APIRouter, Depends, HTTPException, status, WebSocket, WebSocketDisconnect, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.auth import Usuario, AuthSession
from app.schemas.auth import (
    UsuarioResponse, Token, GoogleSSOLoginRequest, 
    BypassLoginRequest, AspiranteRegisterRequest
)
from app.services.auth_service import AuthService
from app.core.websocket import manager

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login-bypass", auto_error=False)

async def get_current_user(
    request: Request,
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
) -> Usuario:
    """
    Dependencia global para autenticar peticiones HTTP y convalidar la sesión híbrida.
    Si la sesión fue revocada, levanta una excepción 401 estructurada.
    """
    if not token:
        token = request.query_params.get("token")
        
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, 
            detail="Credenciales de acceso no suministradas."
        )
    
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, 
            detail="Token inválido o expirado."
        )
    
    usuario_id = int(payload.get("sub"))
    jti = payload.get("jti")

    # Validar sesión híbrida contra base de datos
    session_active = await AuthService.validate_session(db, usuario_id, jti)
    if not session_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error_code": "AUTHENTICATION_SESSION_REVOKED",
                "message": "Las credenciales de acceso suministradas ya no cuentan con una sesión activa en la base de datos."
            }
        )

    # Buscar perfil
    query = select(Usuario).where(Usuario.id == usuario_id)
    res = await db.execute(query)
    usuario = res.scalars().first()
    
    if not usuario:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, 
            detail="El usuario asociado a esta sesión ya no existe."
        )
    
    return usuario

def require_roles(roles: List[str]):
    """
    Filtro de autorización basado en RBAC.
    """
    async def _role_check(current_user: Usuario = Depends(get_current_user)):
        if current_user.rol not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Acceso denegado: Se requiere alguno de los roles {roles}."
            )
        return current_user
    return _role_check


# --- ENDPOINTS ---

@router.post("/login-sso", response_model=Token)
async def login_sso(data: GoogleSSOLoginRequest, db: AsyncSession = Depends(get_db)):
    """
    Endpoint institucional para Google SSO.
    En ambiente de prueba, decodificamos el email directamente del credential token simulado.
    """
    # En producción real verificaríamos con la librería google-auth.
    # Simulamos decodificando el valor provisto (que puede ser el email plano o JWT simulado)
    email = data.credential
    if "@" not in email:
        email = f"{data.credential}@hospital.local"
        
    nombre = email.split("@")[0].capitalize()
    apellido = "Institucional"
    
    res = await AuthService.process_sso_login(db, email, nombre, apellido)
    if res["action"] == "redirect_aspirante":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=res["message"]
        )
    return res

@router.post("/login-bypass", response_model=Token)
async def login_bypass(data: BypassLoginRequest, db: AsyncSession = Depends(get_db)):
    """
    SSO Bypass de desarrollo. Permite iniciar sesión con cualquier correo registrado.
    """
    nombre = data.email.split("@")[0].capitalize()
    res = await AuthService.process_sso_login(db, data.email, nombre, "Desarrollo")
    if res["action"] == "redirect_aspirante":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=res["message"]
        )
    return res

@router.post("/register-aspirante", response_model=UsuarioResponse)
async def register_aspirante(
    data: AspiranteRegisterRequest, 
    current_user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Permite que un Aspirante complete su registro enviando su cédula institucional.
    """
    if current_user.rol != "Aspirante":
        raise HTTPException(
            status_code=400, 
            detail="Operación inválida: Su rol actual no es Aspirante."
        )
    
    usuario = await AuthService.register_aspirante_form(
        db, 
        email=current_user.email,
        cedula=data.cedula,
        nombre=data.nombre,
        apellido=data.apellido
    )
    return usuario

@router.get("/me", response_model=UsuarioResponse)
async def get_me(current_user: Usuario = Depends(get_current_user)):
    """
    Devuelve los datos del perfil activo.
    """
    return current_user

@router.get("/users/pending", response_model=List[UsuarioResponse])
async def get_pending_users(
    current_user: Usuario = Depends(require_roles(["Admin"])),
    db: AsyncSession = Depends(get_db)
):
    """
    Obtiene todos los usuarios en estado PENDIENTE de evaluación.
    """
    query = select(Usuario).where(Usuario.estado == "PENDIENTE")
    res = await db.execute(query)
    return res.scalars().all()

@router.get("/users", response_model=List[UsuarioResponse])
async def get_all_users(
    current_user: Usuario = Depends(require_roles(["Admin"])),
    db: AsyncSession = Depends(get_db)
):
    """
    Obtiene todos los usuarios registrados en el sistema (Admin only).
    """
    query = select(Usuario).order_by(Usuario.id.asc())
    res = await db.execute(query)
    return res.scalars().all()

@router.post("/users/{id}/approve")
async def approve_user(
    id: int,
    rol: str,
    current_user: Usuario = Depends(require_roles(["Admin"])),
    db: AsyncSession = Depends(get_db)
):
    """
    Aprueba un Aspirante asignándole un rol y notificándole en tiempo real vía WebSocket.
    """
    query = select(Usuario).where(Usuario.id == id)
    res = await db.execute(query)
    usuario = res.scalars().first()

    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")
    
    if rol not in ('Admin', 'Soporte Técnico', 'Técnico Hardware', 'Técnico Software'):
        raise HTTPException(status_code=400, detail="Rol inválido especificado.")

    usuario.rol = rol
    usuario.estado = "ACEPTADO"
    await db.commit()

    # Enviar notificación WebSocket de desbloqueo al Aspirante en tiempo real
    payload = {
        "event": "account_approved",
        "usuario_id": usuario.id,
        "rol": usuario.rol,
        "estado": usuario.estado
    }
    await manager.send_personal_message(payload, user_id=usuario.id)
    return {"message": f"Usuario {usuario.email} aprobado con rol {usuario.rol}."}

@router.post("/users/{id}/reject")
async def reject_user(
    id: int,
    current_user: Usuario = Depends(require_roles(["Admin"])),
    db: AsyncSession = Depends(get_db)
):
    """
    Rechaza un Aspirante y le notifica en tiempo real.
    """
    query = select(Usuario).where(Usuario.id == id)
    res = await db.execute(query)
    usuario = res.scalars().first()

    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")

    usuario.estado = "RECHAZADO"
    await db.commit()

    # Notificar al WebSocket
    payload = {
        "event": "account_rejected",
        "usuario_id": usuario.id,
        "estado": usuario.estado
    }
    await manager.send_personal_message(payload, user_id=usuario.id)
    return {"message": f"Usuario {usuario.email} rechazado."}

@router.post("/users/{id}/suspend")
async def suspend_user(
    id: int,
    current_user: Usuario = Depends(require_roles(["Admin"])),
    db: AsyncSession = Depends(get_db)
):
    """
    Suspende a un técnico desactivando inmediatamente todas sus sesiones híbridas activas.
    """
    query = select(Usuario).where(Usuario.id == id)
    res = await db.execute(query)
    usuario = res.scalars().first()

    if not usuario:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")

    usuario.estado = "RECHAZADO"
    
    # Desactivar sesiones
    sess_update = update(AuthSession).where(AuthSession.usuario_id == id).values(activa=False)
    await db.execute(sess_update)
    await db.commit()

    # Expulsar de WebSocket
    payload = {"event": "session_terminated"}
    await manager.send_personal_message(payload, user_id=usuario.id)
    return {"message": f"Usuario {usuario.email} suspendido y sesiones revocadas."}

@router.post("/otp/request")
async def request_otp(cedula: str, db: AsyncSession = Depends(get_db)):
    """
    Solicita un OTP temporal de vinculación de Telegram.
    """
    otp = await AuthService.generate_otp(db, cedula)
    return {"message": "Código OTP generado con éxito.", "otp_debug": otp}

@router.post("/otp/verify")
async def verify_otp(cedula: str, telegram_id: str, code: str, db: AsyncSession = Depends(get_db)):
    """
    Valida el OTP ingresado por Telegram y vincula la cuenta del bot al empleado.
    """
    success = await AuthService.verify_otp(db, cedula, telegram_id, code)
    if not success:
        raise HTTPException(status_code=400, detail="Código OTP inválido.")
    return {"message": "Cuenta de Telegram vinculada exitosamente a la ficha de nómina."}


# --- CANAL WEBSOCKET DE ESTADO ---

@router.websocket("/ws/status")
async def ws_status(websocket: WebSocket, token: str, db: AsyncSession = Depends(get_db)):
    """
    WebSocket nativo para conmutar la pantalla del Aspirante a activa
    o despachar alertas de seguridad e incidencias a operadores.
    """
    payload = decode_access_token(token)
    if not payload:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    
    usuario_id = int(payload.get("sub"))
    jti = payload.get("jti")

    # Validar sesión híbrida
    session_active = await AuthService.validate_session(db, usuario_id, jti)
    if not session_active:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # Buscar perfil
    query = select(Usuario).where(Usuario.id == usuario_id)
    res = await db.execute(query)
    usuario = res.scalars().first()

    if not usuario:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    user_info = {
        "usuario_id": usuario.id,
        "email": usuario.email,
        "rol": usuario.rol
    }
    
    await manager.connect(websocket, user_info)
    try:
        while True:
            # Mantener conexión activa y responder pings/mensajes si los hay
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
