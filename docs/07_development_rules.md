# 7. CATEGORÍA: Reglas de Desarrollo y Estilo

## 7.1. Stack Tecnológico

* **Backend Layer:** Python versión 3.11+ junto a FastAPI. Manejo asíncrono puro (`async/await`) para operaciones de entrada/salida y llamadas HTTP externas.
* **Frontend Layer:** React versión 18+ estructurado sobre **Vite** para la compilación ágil. Código desarrollado exclusivamente bajo TypeScript estructurado y tipado.
* **Database Layer:** PostgreSQL versión 15+. Uso de SQLAlchemy versión 2.0 en modo asíncrono para el mapeo relacional del monolito.

## 7.2. Convenciones de Código

* **Entorno Python (Backend):** Estilo de nomenclatura basado estrictamente en `snake_case` para variables, funciones, endpoints y esquemas. Las clases de datos siguen `PascalCase`. Tipado obligatorio mediante Type Hints y esquemas de validación dual con Pydantic v2.
* **Entorno TypeScript (Frontend):** Estilo de nomenclatura basado en `camelCase` para variables, estados, propiedades de componentes y mapeo de objetos JSON. Los componentes funcionales de React y las interfaces se declaran en `PascalCase`. Prohibido el uso del tipo genérico `any`; toda respuesta o payload debe contar con una interfaz explícita en `types/index.ts`.

## 7.3. Estrategia de Manejo de Errores

* **Backend:** Implementación de un Middleware Global interceptor de excepciones. Las fallas controladas del negocio se lanzan mediante excepciones personalizadas que heredan de `HTTPException`. Las fallas relacionales arrojadas por las restricciones (`CONSTRAINTS`) de PostgreSQL se capturan examinando los códigos de error nativos del motor (ej. Código `23514` para violación de check de stock), traduciéndose en respuestas estructuradas de tipo JSON con código `409 Conflict` antes de romper el hilo de ejecución.
* **Frontend:** Uso mandatorio de componentes de control de fallas corporativos (**Error Boundaries**) en React para envolver los módulos principales del dashboard. Cada llamada a la API debe estar encapsulada en bloques `try/catch`, procesando los códigos de error detallados del backend para activar las interfaces de contingencia (como el guardado en Borrador).

## 7.4. Lista de "Prohibiciones Strict"

> [!CAUTION]
> * **PROHIBIDO** la ejecución de sentencias de manipulación o borrado físico (`DELETE`, `TRUNCATE`) sobre las tablas de datos operacionales del hospital. Todo descarte debe ser lógico (`Soft-Delete`).
> * **PROHIBIDO** omitir las validaciones de tipos de datos o lógica de negocio en el backend bajo la falsa premisa de que "el frontend ya valida los campos de los formularios".
> * **PROHIBIDO** el uso de consultas SQL crudas encadenadas en strings de texto libre dentro de los controladores; todo query debe estar parametrizado y estructurado a través del ORM o funciones almacenadas para erradicar ataques de inyección SQL.
