import uuid
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Optional
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException, status
from app.core.security import create_access_token
from app.models.auth import Usuario, Empleado, AuthSession

class AuthService:
    @staticmethod
    async def process_sso_login(db: AsyncSession, email: str, nombre: str, apellido: str) -> dict:
        """
        Procesa el inicio de sesión federado.
        Si la cuenta no existe en usuarios, la crea en estado PENDIENTE.
        Si existe y está ACEPTADO, genera una sesión activa y retorna el token JWT.
        """
        # Validar dominio institucional (@hospital.local)
        if not (email.endswith("@hospital.local") or email.endswith("@hospital.gob")):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Acceso restringido: Solo se permiten correos institucionales del hospital."
            )

        # Buscar usuario en BD
        query = select(Usuario).where(Usuario.email == email)
        result = await db.execute(query)
        usuario = result.scalars().first()

        # Caso 1: Usuario no existe -> Registro automático como PENDIENTE / Aspirante
        if not usuario:
            # Buscar si existe en nómina (empleados) por correo electrónico
            emp_query = select(Empleado).where(Empleado.datos_contacto["email"].as_string() == email)
            emp_result = await db.execute(emp_query)
            empleado = emp_result.scalars().first()

            usuario = Usuario(
                email=email,
                cedula=empleado.cedula if empleado else None,
                nombre=nombre,
                apellido=apellido,
                rol="Aspirante",
                estado="PENDIENTE"
            )
            db.add(usuario)
            await db.commit()
            await db.refresh(usuario)

            return {
                "action": "redirect_aspirante",
                "message": "Solicitud registrada. Su cuenta está PENDIENTE de aprobación por el Administrador.",
                "usuario": usuario
            }

        # Caso 2: Usuario existe pero está PENDIENTE
        if usuario.estado == "PENDIENTE":
            return {
                "action": "redirect_aspirante",
                "message": "Su solicitud de acceso aún se encuentra bajo revisión de la administración.",
                "usuario": usuario
            }

        # Caso 3: Usuario existe pero fue RECHAZADO -> Permitir postularse de nuevo limpiamente
        if usuario.estado == "RECHAZADO":
            usuario.estado = "PENDIENTE"
            await db.commit()
            await db.refresh(usuario)
            return {
                "action": "redirect_aspirante",
                "message": "Su postulación previa fue rechazada. Se ha restablecido su solicitud a PENDIENTE para una nueva evaluación.",
                "usuario": usuario
            }

        # Caso 4: Usuario está ACEPTADO -> Crear sesión híbrida y devolver JWT
        jti = str(uuid.uuid4())
        session = AuthSession(
            usuario_id=usuario.id,
            token_jti=jti,
            activa=True
        )
        db.add(session)
        await db.commit()

        token = create_access_token(subject=usuario.id, jti=jti)
        return {
            "action": "login_success",
            "access_token": token,
            "token_type": "bearer",
            "usuario": usuario
        }

    @staticmethod
    async def register_aspirante_form(db: AsyncSession, email: str, cedula: str, nombre: str, apellido: str) -> Usuario:
        """
        Completa el formulario inicial de Aspirante si la cuenta fue auto-creada por login.
        Valida que la cédula exista en nómina (empleados).
        """
        # Verificar si la cédula existe en nómina
        query_emp = select(Empleado).where(Empleado.cedula == cedula)
        res_emp = await db.execute(query_emp)
        empleado = res_emp.scalars().first()

        if not empleado:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Cédula no válida: No se encuentra registrada en la nómina de RRHH del hospital."
            )
        if empleado.estado != "Activo":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Acceso Denegado: Su ficha de empleado se encuentra Inactiva."
            )

        # Buscar usuario
        query_usr = select(Usuario).where(Usuario.email == email)
        res_usr = await db.execute(query_usr)
        usuario = res_usr.scalars().first()

        if not usuario:
            usuario = Usuario(
                email=email,
                cedula=cedula,
                nombre=nombre,
                apellido=apellido,
                rol="Aspirante",
                estado="PENDIENTE"
            )
            db.add(usuario)
        else:
            usuario.cedula = cedula
            usuario.nombre = nombre
            usuario.apellido = apellido
            usuario.estado = "PENDIENTE" # Forzar a pendiente

        await db.commit()
        await db.refresh(usuario)
        return usuario

    @staticmethod
    async def validate_session(db: AsyncSession, usuario_id: int, jti: str) -> bool:
        """
        Valida si la sesión híbrida se encuentra activa en base de datos.
        Permite la revocación instantánea (expulsión) por parte del Admin.
        """
        query = select(AuthSession.activa).where(
            AuthSession.token_jti == jti,
            AuthSession.usuario_id == usuario_id
        )
        result = await db.execute(query)
        activa = result.scalars().first()
        return bool(activa)

    @staticmethod
    async def generate_otp(db: AsyncSession, cedula: str) -> str:
        """
        Genera un OTP temporal para asociar la cuenta de Telegram con un empleado.
        """
        query = select(Empleado).where(Empleado.cedula == cedula)
        res = await db.execute(query)
        empleado = res.scalars().first()

        if not empleado:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Cédula de nómina no encontrada."
            )

        if empleado.estado != "Activo":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="El empleado asociado a esta cédula no está Activo."
            )

        # Generar código 6 dígitos
        otp_raw = str(uuid.uuid4().int)[:6]
        # Hash SHA-256
        otp_hash = hashlib.sha256(otp_raw.encode()).hexdigest()
        
        # Expiración: 10 minutos
        expiration = datetime.utcnow() + timedelta(minutes=10)

        empleado.otp_hash = otp_hash
        empleado.otp_expiracion = expiration
        empleado.intentos_fallidos = 0
        await db.commit()

        # En ambiente hospitalario local, imprimiremos el OTP en logs/salida estándar 
        # para simular el envío del SMS/correo.
        print(f"\n[SMTP/SMS SIMULATOR] OTP generado para Cédula {cedula}: {otp_raw}\n")

        return otp_raw

    @staticmethod
    async def verify_otp(db: AsyncSession, cedula: str, telegram_id: str, otp_code: str) -> bool:
        """
        Verifica el OTP ingresado por Telegram. Si es correcto, vincula la cuenta de Telegram.
        """
        query = select(Empleado).where(Empleado.cedula == cedula)
        res = await db.execute(query)
        empleado = res.scalars().first()

        if not empleado:
            raise HTTPException(status_code=404, detail="Empleado no encontrado.")

        if not empleado.otp_hash or not empleado.otp_expiracion:
            raise HTTPException(status_code=400, detail="No se ha solicitado ningún código OTP para esta cédula.")

        if datetime.utcnow() > empleado.otp_expiracion:
            # Limpiar OTP expirado
            empleado.otp_hash = None
            empleado.otp_expiracion = None
            await db.commit()
            raise HTTPException(status_code=400, detail="El código OTP ha expirado.")

        if empleado.intentos_fallidos >= 3:
            # Limpiar OTP por seguridad
            empleado.otp_hash = None
            empleado.otp_expiracion = None
            await db.commit()
            raise HTTPException(status_code=400, detail="Se ha excedido el número máximo de intentos fallidos. Solicite un nuevo código.")

        # Verificar código
        hashed_input = hashlib.sha256(otp_code.encode()).hexdigest()
        if hashed_input != empleado.otp_hash:
            empleado.intentos_fallidos += 1
            await db.commit()
            return False

        # OTP correcto: asociar telegram_id
        empleado.telegram_id = telegram_id
        # Limpiar OTP
        empleado.otp_hash = None
        empleado.otp_expiracion = None
        empleado.intentos_fallidos = 0
        await db.commit()
        return True
