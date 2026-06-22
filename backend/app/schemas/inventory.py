from datetime import datetime
from typing import Optional, Dict, Any
from pydantic import BaseModel, EmailStr

# --- INVENTARIO SCHEMAS ---
class InventarioItemBase(BaseModel):
    nombre: str
    tipo: str # Consumible, Herramienta
    stock: int
    stock_minimo: int = 5

class InventarioItemCreate(InventarioItemBase):
    pass

class InventarioItemResponse(InventarioItemBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


# --- PRESTAMOS SCHEMAS ---
class PrestamoHerramientaCreate(BaseModel):
    herramienta_id: int
    beneficiario_cedula: str

class PrestamoHerramientaResponse(BaseModel):
    id: int
    herramienta_id: int
    autorizador_id: int
    beneficiario_cedula: str
    fecha_prestamo: datetime
    fecha_devolucion_estimada: datetime
    fecha_devolucion_real: Optional[datetime]
    estado: str

    herramienta: InventarioItemResponse
    autorizador: Dict[str, Any]
    beneficiario: Dict[str, Any]

    class Config:
        from_attributes = True


# --- CONFIGURACION SISTEMA SCHEMAS ---
class ConfiguracionSistemaUpdate(BaseModel):
    correo_bienes_institucional: str
    smtp_server_config: Dict[str, Any]
    tiempo_max_prestamo_herramientas: int
    dias_retencion_audios: int
    dias_retencion_auditoria: int

class ConfiguracionSistemaResponse(BaseModel):
    id: int
    correo_bienes_institucional: str
    smtp_server_config: Dict[str, Any]
    tiempo_max_prestamo_herramientas: int
    dias_retencion_audios: int
    dias_retencion_auditoria: int
    updated_at: datetime

    class Config:
        from_attributes = True


# --- ALERTA SISTEMA SCHEMAS ---
class AlertaSistemaResponse(BaseModel):
    id: int
    mensaje: str
    destinatario_rol: str
    leida: bool
    created_at: datetime

    class Config:
        from_attributes = True


# --- AUDITORIA LOG SCHEMAS ---
class AuditoriaLogResponse(BaseModel):
    id: int
    usuario_id: Optional[int]
    rol_ejecutor: str
    accion_ejecutada: str
    tabla_afectada: str
    registro_id: int
    snapshot_cambio: Dict[str, Any]
    timestamp: datetime

    class Config:
        from_attributes = True
