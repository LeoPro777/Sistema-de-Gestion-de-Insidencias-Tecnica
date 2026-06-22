from datetime import datetime
from typing import Optional, List, Dict, Any
from sqlalchemy import String, Integer, DateTime, ForeignKey, Text, Boolean, Enum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base
from app.models.auth import Empleado, Usuario

class InventarioItem(Base):
    __tablename__ = "inventario_departamento"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nombre: Mapped[str] = mapped_column(String(150), nullable=False)
    tipo: Mapped[str] = mapped_column(Enum('Consumible', 'Herramienta', name="un_tipo_item", create_type=False), nullable=False)
    stock: Mapped[int] = mapped_column(Integer, default=0)
    stock_minimo: Mapped[int] = mapped_column(Integer, default=5)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # Relación intermedia
    ordenes_consumo: Mapped[List["OrdenConsumible"]] = relationship(back_populates="consumible", cascade="all, delete-orphan")
    prestamos: Mapped[List["PrestamoHerramienta"]] = relationship(back_populates="herramienta", cascade="all, delete-orphan")


class PrestamoHerramienta(Base):
    __tablename__ = "prestamos_herramientas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    herramienta_id: Mapped[int] = mapped_column(Integer, ForeignKey("inventario_departamento.id", ondelete="RESTRICT"), nullable=False)
    autorizador_id: Mapped[int] = mapped_column(Integer, ForeignKey("usuarios.id", ondelete="RESTRICT"), nullable=False)
    beneficiario_cedula: Mapped[str] = mapped_column(String(20), ForeignKey("empleados.cedula", ondelete="RESTRICT"), nullable=False)
    fecha_prestamo: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    fecha_devolucion_estimada: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    fecha_devolucion_real: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    estado: Mapped[str] = mapped_column(Enum('Activo', 'Devuelto', 'Retrasado', 'Dañado', 'Perdido', name="un_estado_prestamo", create_type=False), default="Activo")

    herramienta: Mapped[InventarioItem] = relationship(back_populates="prestamos")
    autorizador: Mapped[Usuario] = relationship()
    beneficiario: Mapped[Empleado] = relationship()


class ConfiguracionSistema(Base):
    __tablename__ = "configuraciones_sistema"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    correo_bienes_institucional: Mapped[str] = mapped_column(String(255), nullable=False)
    smtp_server_config: Mapped[Dict[str, Any]] = mapped_column(JSONB, nullable=False)
    tiempo_max_prestamo_herramientas: Mapped[int] = mapped_column(Integer, default=24)
    dias_retencion_audios: Mapped[int] = mapped_column(Integer, default=30)
    dias_retencion_auditoria: Mapped[int] = mapped_column(Integer, default=365)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ColaCorreosOutbox(Base):
    __tablename__ = "cola_correos_outbox"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    destinatario: Mapped[str] = mapped_column(String(255), nullable=False)
    asunto: Mapped[str] = mapped_column(String(200), nullable=False)
    cuerpo_html: Mapped[str] = mapped_column(Text, nullable=False)
    procesado: Mapped[bool] = mapped_column(Boolean, default=False)
    intentos: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class AlertasSistema(Base):
    __tablename__ = "alertas_sistema"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    mensaje: Mapped[str] = mapped_column(Text, nullable=False)
    destinatario_rol: Mapped[str] = mapped_column(Enum('Admin', 'Soporte Técnico', 'Técnico Hardware', 'Técnico Software', 'Aspirante', name="un_rol", create_type=False), default="Soporte Técnico")
    leida: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class AuditoriaLog(Base):
    __tablename__ = "auditoria_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    usuario_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("usuarios.id", ondelete="SET NULL"), nullable=True)
    rol_ejecutor: Mapped[str] = mapped_column(String(50), nullable=False)
    accion_ejecutada: Mapped[str] = mapped_column(String(100), nullable=False)
    tabla_afectada: Mapped[str] = mapped_column(String(100), nullable=False)
    registro_id: Mapped[int] = mapped_column(Integer, nullable=False)
    snapshot_cambio: Mapped[Dict[str, Any]] = mapped_column(JSONB, nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    usuario: Mapped[Optional[Usuario]] = relationship()
