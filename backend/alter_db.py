import asyncio
import os
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = f"postgresql+asyncpg://{os.getenv('POSTGRES_USER')}:{os.getenv('POSTGRES_PASSWORD')}@{os.getenv('POSTGRES_SERVER')}:{os.getenv('POSTGRES_PORT')}/{os.getenv('POSTGRES_DB')}"

engine = create_async_engine(DATABASE_URL, echo=True)

async def alter_db():
    async with engine.begin() as conn:
        await conn.execute(text("ALTER TABLE pre_ordenes ADD COLUMN IF NOT EXISTS codigo_maquina_crudo VARCHAR(50);"))
        print("Columna agregada correctamente a la tabla pre_ordenes.")

asyncio.run(alter_db())
