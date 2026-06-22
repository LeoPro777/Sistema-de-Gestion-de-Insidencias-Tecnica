# 2. CATEGORÍA: Arquitectura y Estructura

## 2.1. Patrón Arquitectónico

El sistema se diseña bajo un patrón de **Monolito de Alta Cohesión**, segmentado en tres capas lógicas bien definidas:

1. **Capa de Presentación (Frontend):** Aplicación de una sola página (SPA) desarrollada en React con TypeScript, estructurada por componentes y hooks personalizados que consumen de forma abstracta la API del backend.
2. **Capa de Aplicación y Dominio (Backend):** Servidor HTTP asíncrono con FastAPI estructurado en routers, esquemas de validación y servicios independientes de lógica empresarial. Alberga un planificador interno de hilos (*Daemons*) para mantenimiento de fondo.
3. **Capa de Persistencia e Integridad (Base de Datos):** Motor relacional PostgreSQL encargado de encapsular las restricciones duras del negocio a través de Triggers, Funciones Almacenadas (`PL/pgSQL`) y control transaccional estricto.

## 2.2. Árbol de Directorios Objetivo

```
monolito-hospitalario/
├── backend/
│   ├── app/
│   │   ├── core/
│   │   │   ├── config.py
│   │   │   ├── database.py
│   │   │   └── security.py
│   │   ├── models/
│   │   │   ├── auth.py
│   │   │   ├── devices.py
│   │   │   ├── incidents.py
│   │   │   └── inventory.py
│   │   ├── schemas/
│   │   │   ├── auth.py
│   │   │   ├── devices.py
│   │   │   ├── incidents.py
│   │   │   └── inventory.py
│   │   ├── routers/
│   │   │   ├── auth.py
│   │   │   ├── devices.py
│   │   │   ├── incidents.py
│   │   │   └── inventory.py
│   │   ├── services/
│   │   │   ├── auth_service.py
│   │   │   ├── incident_service.py
│   │   │   └── outbox_worker.py
│   │   └── daemons/
│   │       └── scheduler.py
│   ├── database/
│   │   ├── init.sql
│   │   ├── triggers.sql
│   │   └── seeders.sql
│   ├── Dockerfile
│   └── main.py
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── assets/
│   │   ├── components/
│   │   │   ├── common/
│   │   │   ├── dashboard/
│   │   │   └── inventory/
│   │   ├── context/
│   │   │   └── AuthContext.tsx
│   │   ├── hooks/
│   │   │   ├── useWebSocket.ts
│   │   │   └── useFetch.ts
│   │   ├── services/
│   │   │   └── api.ts
│   │   ├── types/
│   │   │   └── index.ts
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── Dockerfile
│   ├── tsconfig.json
│   └── vite.config.ts
└── docker-compose.yml
```

## 2.3. Responsabilidad de Componentes

* `routers/`: Manejo exclusivo del protocolo HTTP (parámetros de entrada, rutas, inyección de dependencias de sesión y respuestas). Prohibido inyectar queries o lógica de negocio directa.
* `services/`: Orquestación completa de las reglas empresariales, mutación de estados lógicos y llamadas transaccionales a la base de datos.
* `schemas/`: Clases de Pydantic encargadas de la serialización, tipado estricto y coacción de tipos de datos en la entrada y salida de la API.
* `triggers.sql`: Código procedural nativo alojado en PostgreSQL encargado de interceptar escrituras para el descuento automático, control de logs inmutables y encolamiento Outbox.
* `components/`: Piezas visuales aisladas y reutilizables en el cliente web. No realizan llamadas HTTP directas; consumen los hooks abstractos.

## 2.4. Protocolos y Canales de Comunicación

* **REST HTTP:** Utilizado para operaciones síncronas de datos (Consultas de inventario, sumisión de formularios, autenticación inicial, configuraciones globales y reportes en flujos de memoria).
* **WebSockets Nativos:** Conexión persistente full-duplex establecida entre el cliente React y FastAPI tras el inicio de sesión. Utilizado para el desbloqueo asíncrono de Aspirantes y el despacho inmediato de las alertas sonoras y visuales a Soporte Técnico.
