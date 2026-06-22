from typing import Optional, Dict, Any
from pydantic import BaseModel, EmailStr, Field

class Token(BaseModel):
    access_token: str
    token_type: str
    usuario: "UsuarioResponse"

class TokenPayload(BaseModel):
    sub: str
    jti: str
    exp: int

class GoogleSSOLoginRequest(BaseModel):
    credential: str

class BypassLoginRequest(BaseModel):
    email: str

class AspiranteRegisterRequest(BaseModel):
    cedula: str = Field(..., pattern=r"^[VE]-[0-9]+$")
    nombre: str
    apellido: str

class EmpleadoResponse(BaseModel):
    cedula: str
    telegram_id: Optional[str]
    nombre: str
    apellido: str
    estado: str
    datos_contacto: Dict[str, Any]

    class Config:
        from_attributes = True

class UsuarioResponse(BaseModel):
    id: int
    email: str
    cedula: Optional[str]
    nombre: str
    apellido: str
    rol: str
    estado: str

    class Config:
        from_attributes = True

# Resolver referencias circulares de tipado
Token.model_rebuild()
