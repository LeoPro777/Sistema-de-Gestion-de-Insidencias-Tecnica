from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from app.core.config import settings

# Crear motor asíncrono optimizado con pre-ping para evitar conexiones caídas
engine = create_async_engine(
    settings.ASYNC_DATABASE_URI,
    echo=False,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20
)

# Generador de sesiones de base de datos
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)

# Clase base ORM
class Base(DeclarativeBase):
    pass

# Dependencia para inyección en FastAPI endpoints
async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
