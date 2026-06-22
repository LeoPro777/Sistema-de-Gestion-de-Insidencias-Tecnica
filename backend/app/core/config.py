import json
from typing import List, Union
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        # Intenta buscar el .env en la carpeta de ejecución o un directorio arriba
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )

    ENVIRONMENT: str = "development"
    SECRET_KEY: str
    BACKEND_CORS_ORIGINS: Union[List[str], str] = []

    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> Union[List[str], str]:
        if isinstance(v, str):
            v_str = v.strip()
            if not v_str:
                return []
            if v_str.startswith("[") and v_str.endswith("]"):
                try:
                    return json.loads(v_str)
                except Exception:
                    pass
            return [i.strip() for i in v_str.split(",") if i.strip()]
        return v

    # Credenciales PostgreSQL
    POSTGRES_SERVER: str = "127.0.0.1"
    POSTGRES_USER: str = "app_hospital_user"
    POSTGRES_PASSWORD: str = "seguridad_encriptada_2026"
    POSTGRES_DB: str = "hospital_incidentes_db"
    POSTGRES_PORT: int = 5432

    # Ingestor webhook Telegram Token
    BOT_API_KEY: str
    
    # Procesamiento con IA
    GEMINI_API_KEY: str

    # Correo SMTP
    SMTP_HOST: str = "smtp.hospital.local"
    SMTP_PORT: int = 587
    SMTP_USER: str = "alertas.inventario@hospital.local"
    SMTP_PASSWORD: str = "password_correo_institucional"

    @property
    def ASYNC_DATABASE_URI(self) -> str:
        return f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"

settings = Settings()
