import uuid
from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, Integer, DateTime, ForeignKey, Text, UUID, Enum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
from app.models.auth import Empleado, Usuario
from app.models.devices import Dispositivo, AreaHospital

class PreOrden(Base):
    __tablename__ = "pre_ordenes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    numero_reporte: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), unique=True, default=uuid.uuid4)
    telegram_id: Mapped[str] = mapped_column(String(100), ForeignKey("empleados.telegram_id", ondelete="RESTRICT"), nullable=False)
    tipo_requerimiento: Mapped[str] = mapped_column(String(100), nullable=False)
    area_id: Mapped[int] = mapped_column(Integer, ForeignKey("areas_hospital.id", ondelete="RESTRICT"), nullable=False)
    urgencia: Mapped[str] = mapped_column(Enum("Crítica", "Alta", "Media", "Baja", name="una_urgencia", create_type=False), default="Media") # Mapeado al Enum nativo de PG
    resumen: Mapped[str] = mapped_column(Text, nullable=False)
    codigo_maquina_crudo: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    audio_path: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    estado: Mapped[str] = mapped_column(Enum("PRE_ORDEN", "ASIGNADA", "EN_PROCESO", "RESUELTA", "RECHAZADA", name="un_estado_orden", create_type=False), default="PRE_ORDEN")
    device_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("dispositivos.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    empleado: Mapped[Empleado] = relationship(foreign_keys=[telegram_id], primaryjoin="PreOrden.telegram_id == Empleado.telegram_id")
    area: Mapped[AreaHospital] = relationship()
    dispositivo: Mapped[Optional[Dispositivo]] = relationship(back_populates="pre_ordenes")
    orden: Mapped[Optional["Orden"]] = relationship(back_populates="pre_orden", uselist=False, cascade="all, delete-orphan")


class Orden(Base):
    __tablename__ = "ordenes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    pre_orden_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("pre_ordenes.id", ondelete="CASCADE"), unique=True, nullable=True)
    device_id: Mapped[int] = mapped_column(Integer, ForeignKey("dispositivos.id", ondelete="CASCADE"), nullable=False)
    tecnico_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    soporte_id: Mapped[int] = mapped_column(Integer, ForeignKey("usuarios.id"), nullable=False)
    estado: Mapped[str] = mapped_column(Enum("PRE_ORDEN", "ASIGNADA", "EN_PROCESO", "RESUELTA", "RECHAZADA", name="un_estado_orden", create_type=False), default="ASIGNADA")
    diagnostico: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    solucion_parametrica: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    pre_orden: Mapped[Optional[PreOrden]] = relationship(back_populates="orden")
    dispositivo: Mapped[Dispositivo] = relationship(back_populates="ordenes")
    tecnico: Mapped[Optional[Usuario]] = relationship(foreign_keys=[tecnico_id])
    soporte: Mapped[Usuario] = relationship(foreign_keys=[soporte_id])
    consumibles: Mapped[List["OrdenConsumible"]] = relationship(back_populates="orden", cascade="all, delete-orphan")


class OrdenConsumible(Base):
    __tablename__ = "orden_consumibles"

    orden_id: Mapped[int] = mapped_column(Integer, ForeignKey("ordenes.id", ondelete="CASCADE"), primary_key=True)
    consumible_id: Mapped[int] = mapped_column(Integer, ForeignKey("inventario_departamento.id", ondelete="RESTRICT"), primary_key=True)
    cantidad: Mapped[int] = mapped_column(Integer, nullable=False)

    orden: Mapped[Orden] = relationship(back_populates="consumibles")
    consumible: Mapped["InventarioItem"] = relationship(back_populates="ordenes_consumo")

    @property
    def nombre(self) -> Optional[str]:
        return self.consumible.nombre if self.consumible else None
