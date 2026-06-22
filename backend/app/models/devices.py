from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, Integer, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base

class AreaHospital(Base):
    __tablename__ = "areas_hospital"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nombre: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    descripcion: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    dispositivos: Mapped[List["Dispositivo"]] = relationship(back_populates="area", cascade="all, delete-orphan")


class Dispositivo(Base):
    __tablename__ = "dispositivos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    codigo_activo: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    serial: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    mac_address: Mapped[Optional[str]] = mapped_column(String(17), unique=True, nullable=True)
    ip_fija: Mapped[Optional[str]] = mapped_column(String(15), nullable=True)
    marca: Mapped[str] = mapped_column(String(100), nullable=False)
    area_id: Mapped[int] = mapped_column(Integer, ForeignKey("areas_hospital.id", ondelete="RESTRICT"), nullable=False)
    descripcion: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    estado_patrimonial: Mapped[str] = mapped_column(String(50), default="Activo")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    area: Mapped[AreaHospital] = relationship(back_populates="dispositivos")
    pre_ordenes: Mapped[List["PreOrden"]] = relationship(back_populates="dispositivo")
    ordenes: Mapped[List["Orden"]] = relationship(back_populates="dispositivo")
    traslados: Mapped[List["Traslado"]] = relationship(back_populates="dispositivo", cascade="all, delete-orphan")


class Traslado(Base):
    __tablename__ = "traslados"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    device_id: Mapped[int] = mapped_column(Integer, ForeignKey("dispositivos.id", ondelete="CASCADE"), nullable=False)
    area_origen_id: Mapped[int] = mapped_column(Integer, ForeignKey("areas_hospital.id", ondelete="RESTRICT"), nullable=False)
    area_destino_id: Mapped[int] = mapped_column(Integer, ForeignKey("areas_hospital.id", ondelete="RESTRICT"), nullable=False)
    motivo_traslado: Mapped[str] = mapped_column(Text, nullable=False)
    ejecutor_id: Mapped[int] = mapped_column(Integer, ForeignKey("usuarios.id"), nullable=False)
    tipo_movimiento: Mapped[str] = mapped_column(String(50), nullable=False) # Traslado, Desincorporacion, etc.
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    dispositivo: Mapped[Dispositivo] = relationship(back_populates="traslados")
    area_origen: Mapped[AreaHospital] = relationship(foreign_keys=[area_origen_id])
    area_destino: Mapped[AreaHospital] = relationship(foreign_keys=[area_destino_id])
    ejecutor: Mapped["Usuario"] = relationship()
