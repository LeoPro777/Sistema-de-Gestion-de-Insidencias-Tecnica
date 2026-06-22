from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, UUID4
from app.schemas.auth import EmpleadoResponse, UsuarioResponse
from app.schemas.devices import DispositivoResponse, AreaHospitalResponse

# --- CONSUMIBLE DETAIL SCHEMAS ---
class OrdenConsumibleCreate(BaseModel):
    consumible_id: int
    cantidad: int

class OrdenConsumibleResponse(BaseModel):
    consumible_id: int
    cantidad: int
    nombre: Optional[str] = None

    class Config:
        from_attributes = True


# --- INGESTA EXTERNA SCHEMAS ---
class PreOrdenIngest(BaseModel):
    telegram_id: str
    tipo_requerimiento: str
    area_id: int
    urgencia: str = "Media" # Crítica, Alta, Media, Baja
    resumen: str
    audio_base64_payload: Optional[str] = None # Codificado en base64 de Telegram Bot


# --- BANDEJA DE PRE-ORDENES SCHEMAS ---
class PreOrdenEdit(BaseModel):
    area_id: int
    tipo_requerimiento: str
    urgencia: str
    resumen: str
    device_id: Optional[int] = None

class PreOrdenResponse(BaseModel):
    id: int
    numero_reporte: UUID4
    telegram_id: str
    tipo_requerimiento: str
    area_id: int
    urgencia: str
    resumen: str
    audio_path: Optional[str]
    estado: str
    device_id: Optional[int]
    created_at: datetime

    empleado: Optional[EmpleadoResponse] = None
    area: Optional[AreaHospitalResponse] = None
    dispositivo: Optional[DispositivoResponse] = None

    class Config:
        from_attributes = True


# --- ACTIVE ORDERS SCHEMAS ---
class OrdenPromote(BaseModel):
    pre_orden_id: int
    device_id: int
    tecnico_id: int # Técnico asignado (Hardware/Software)

class OrdenClose(BaseModel):
    diagnostico: str
    solucion_parametrica: str
    consumibles_utilizados: List[OrdenConsumibleCreate] = []

class OrdenResponse(BaseModel):
    id: int
    pre_orden_id: Optional[int]
    device_id: int
    tecnico_id: Optional[int]
    soporte_id: int
    estado: str
    diagnostico: Optional[str]
    solucion_parametrica: Optional[str]
    created_at: datetime
    closed_at: Optional[datetime]

    pre_orden: Optional[PreOrdenResponse] = None
    dispositivo: DispositivoResponse
    tecnico: Optional[UsuarioResponse] = None
    soporte: UsuarioResponse
    consumibles: List[OrdenConsumibleResponse] = []

    class Config:
        from_attributes = True
