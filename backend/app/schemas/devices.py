from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field

# --- AREA SCHEMAS ---
class AreaHospitalBase(BaseModel):
    nombre: str = Field(..., max_length=100)
    descripcion: Optional[str] = None

class AreaHospitalCreate(AreaHospitalBase):
    pass

class AreaHospitalResponse(AreaHospitalBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


# --- DEVICE SCHEMAS ---
class DispositivoBase(BaseModel):
    codigo_activo: str = Field(..., max_length=50)
    serial: str = Field(..., max_length=100)
    mac_address: Optional[str] = Field(None, pattern=r"^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$")
    ip_fija: Optional[str] = Field(None, pattern=r"^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$")
    marca: str = Field(..., max_length=100)
    area_id: int
    descripcion: Optional[str] = None
    estado_patrimonial: str = "Activo"

class DispositivoCreate(DispositivoBase):
    pass

class DispositivoUpdate(BaseModel):
    ip_fija: Optional[str] = Field(None, pattern=r"^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$")
    descripcion: Optional[str] = None

class DispositivoResponse(DispositivoBase):
    id: int
    created_at: datetime
    area: Optional[AreaHospitalResponse] = None

    class Config:
        from_attributes = True


# --- TRASLADO SCHEMAS ---
class TrasladoBase(BaseModel):
    device_id: int
    area_destino_id: int
    motivo_traslado: str

class TrasladoCreate(TrasladoBase):
    pass

class TrasladoResponse(BaseModel):
    id: int
    device_id: int
    area_origen_id: int
    area_destino_id: int
    motivo_traslado: str
    ejecutor_id: int
    tipo_movimiento: str
    created_at: datetime

    area_origen: AreaHospitalResponse
    area_destino: AreaHospitalResponse

    class Config:
        from_attributes = True
