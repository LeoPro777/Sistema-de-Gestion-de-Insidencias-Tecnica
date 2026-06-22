from datetime import datetime
from typing import Optional, Dict, Any
from sqlalchemy import String, Integer, Boolean, DateTime, ForeignKey, Enum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base

class Empleado(Base):
    __tablename__ = "empleados"

    cedula: Mapped[str] = mapped_column(String(20), primary_key=True)
    telegram_id: Mapped[Optional[str]] = mapped_column(String(100), unique=True, nullable=True)
    nombre: Mapped[str] = mapped_column(String(100), nullable=False)
    apellido: Mapped[str] = mapped_column(String(100), nullable=False)
    estado: Mapped[str] = mapped_column(String(20), default="Activo")
    datos_contacto: Mapped[Dict[str, Any]] = mapped_column(JSONB, nullable=False)
    otp_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    otp_expiracion: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    intentos_fallidos: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relación uno a uno o uno a muchos con usuarios del monolito
    usuario: Mapped[Optional["Usuario"]] = relationship(back_populates="empleado", uselist=False)


class Usuario(Base):
    __tablename__ = "usuarios"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    cedula: Mapped[Optional[str]] = mapped_column(String(20), ForeignKey("empleados.cedula", ondelete="SET NULL"), unique=True, nullable=True)
    nombre: Mapped[str] = mapped_column(String(100), nullable=False)
    apellido: Mapped[str] = mapped_column(String(100), nullable=False)
    rol: Mapped[str] = mapped_column(Enum('Admin', 'Soporte Técnico', 'Técnico Hardware', 'Técnico Software', 'Aspirante', name="un_rol", create_type=False), default="Aspirante")
    estado: Mapped[str] = mapped_column(Enum('PENDIENTE', 'ACEPTADO', 'RECHAZADO', name="un_estado_usuario", create_type=False), default="PENDIENTE")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    empleado: Mapped[Optional[Empleado]] = relationship(back_populates="usuario")
    sessions: Mapped[list["AuthSession"]] = relationship(back_populates="usuario", cascade="all, delete-orphan")


class AuthSession(Base):
    __tablename__ = "auth_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    usuario_id: Mapped[int] = mapped_column(Integer, ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False)
    token_jti: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    activa: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    last_activity: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    usuario: Mapped[Usuario] = relationship(back_populates="sessions")
