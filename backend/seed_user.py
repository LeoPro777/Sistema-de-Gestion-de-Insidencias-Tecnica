import asyncio
import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = f"postgresql+asyncpg://{os.getenv('POSTGRES_USER')}:{os.getenv('POSTGRES_PASSWORD')}@{os.getenv('POSTGRES_SERVER')}:{os.getenv('POSTGRES_PORT')}/{os.getenv('POSTGRES_DB')}"

engine = create_async_engine(DATABASE_URL, echo=True)
async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

async def seed():
    async with async_session() as session:
        # Verificar si la cedula existe
        res = await session.execute(text("SELECT cedula FROM empleados WHERE cedula = '31342608'"))
        if res.scalar() is None:
            # Insertar empleado
            await session.execute(
                text("""
                    INSERT INTO empleados (cedula, nombre, apellido, estado, datos_contacto, intentos_fallidos, updated_at) 
                    VALUES ('31342608', 'Usuario', 'Prueba', 'Activo', '{"email": "prueba@hospital.local", "telefono": "0000000"}', 0, NOW())
                """)
            )
            print("Usuario de prueba insertado con éxito en la tabla empleados.")
        else:
            print("El usuario con cédula 31342608 ya existe en la base de datos.")
            # Asegurarse que esté Activo y con datos
            await session.execute(
                text("""
                    UPDATE empleados SET estado = 'Activo', datos_contacto = '{"email": "prueba@hospital.local", "telefono": "0000000"}' 
                    WHERE cedula = '31342608'
                """)
            )
            print("Usuario actualizado a estado Activo.")

        await session.commit()

asyncio.run(seed())
