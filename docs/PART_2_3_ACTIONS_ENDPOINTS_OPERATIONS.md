# Part 2.3 – Actions (Endpoints / Operations)

This document defines how **Actions** are modeled and how they satisfy the checklist items in section **2.3 Actions (Endpoints / Operations)**.

---

## 1. Overview

An **Action** represents a concrete operation against an external platform, such as:

- \"Create customer in NetSuite\"
- \"Get order by ID from Shopify\"
- \"Sync job from ServiceTitan\"

Key properties:

- Actions are **bound to a specific `AppVersion`** (so changes to an App’s schema/auth can be versioned safely).
- Each Action contains all the information needed to perform an HTTP request:
  - HTTP method
  - Endpoint path template
  - Headers template
  - JSON Schema-like definitions for query/path/body and output
  - Retry policy defaults
  - Timeout defaults

---

## 2. Prisma data model

Defined in `api/prisma/schema.prisma`:

```prisma
enum HttpMethod {
  GET
  POST
  PUT
  PATCH
  DELETE
}

enum RetryStrategy {
  NONE
  FIXED
  EXPONENTIAL
}

model Action {
  id               String        @id @default(uuid())
  appVersionId     String        @map("app_version_id")
  key              String
  name             String
  description      String?
  method           HttpMethod
  endpointTemplate String        @map("endpoint_template")
  headersTemplate  Json?         @map("headers_template")
  querySchema      Json?         @map("query_schema")
  pathSchema       Json?         @map("path_schema")
  bodySchema       Json?         @map("body_schema")
  outputSchema     Json?         @map("output_schema")
  retryStrategy    RetryStrategy @default(FIXED) @map("retry_strategy")
  maxAttempts      Int           @default(3) @map("max_attempts")
  initialDelayMs   Int           @default(1000) @map("initial_delay_ms")
  maxDelayMs       Int?          @map("max_delay_ms")
  timeoutMs        Int           @default(30000) @map("timeout_ms")
  createdAt        DateTime      @default(now())
  updatedAt        DateTime      @updatedAt

  appVersion AppVersion @relation(fields: [appVersionId], references: [id], onDelete: Cascade)

  @@unique([appVersionId, key])
  @@index([appVersionId])
  @@map("actions")
}
```

### 2.1 Binding to AppVersion

Checklist item: **“Action bound to a specific app version.”**

- `Action.appVersionId` (FK) → `AppVersion.id` ensures each Action belongs to exactly one AppVersion.
- Un `App` con múltiples versiones puede tener:
  - Acciones nuevas solo en versiones posteriores.
  - Copias compatibles de la misma acción en diferentes versiones cuando cambia el contrato.

### 2.2 Action metadata

Checklist items under **“Action metadata”**:

- **method (GET/POST/PUT/PATCH/DELETE)**  
  - `Action.method: HttpMethod` enum (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`).

- **endpoint template**  
  - `Action.endpointTemplate` (texto) – plantilla de ruta relativa, p.ej. `/customers/{id}` o `/orders/{orderId}`.
  - Las variables `{}` deben corresponderse con el `pathSchema`.

- **headers template**  
  - `Action.headersTemplate: Json?` – objeto JSON de cabeceras base (sin incluir auth, que viene de Connection/App).
  - Ejemplo: `{ "Content-Type": "application/json", "X-Custom": "{{ someVar }}" }`.

- **query/path/body schema**  
  - `Action.querySchema`, `Action.pathSchema`, `Action.bodySchema: Json?` – cada uno contiene un fragmento de JSON Schema que describe:
    - Parámetros de query (`?page=`, `?status=`…)
    - Segmentos de path (`{id}`, `{orderId}`…)
    - Cuerpo de la petición (payload JSON).

- **output schema**  
  - `Action.outputSchema: Json?` – JSON Schema para la respuesta esperada del endpoint.
  - Se utiliza para validación, generación de tipos y ayuda en el builder de workflows.

- **retry policy defaults**  
  - `Action.retryStrategy: RetryStrategy` – `NONE`, `FIXED` o `EXPONENTIAL`.
  - `Action.maxAttempts: Int` – número máximo de intentos (incluyendo el primero).
  - `Action.initialDelayMs: Int` – delay inicial entre intentos.
  - `Action.maxDelayMs: Int?` – delay máximo para estrategias exponenciales (si aplica).

- **timeout defaults**  
  - `Action.timeoutMs: Int` – tiempo máximo permitido por request en milisegundos (por defecto 30s).

### 2.3 CRUD y unicidad

Checklist item: **“CRUD for `Action`.”**

- El modelo `Action` permite CRUD completo vía Prisma y, más adelante, GraphQL:
  - Crear, actualizar y borrar acciones por `appVersionId` + `key`.
- Restricciones:
  - `@@unique([appVersionId, key])` – cada acción tiene un slug (`key`) único dentro de una AppVersion.

---

## 3. JSON Schema y validación de input/output

Checklist item: **“Input/output schema validation (JSON Schema or equivalent).”**

- Los campos `querySchema`, `pathSchema`, `bodySchema`, `outputSchema` almacenan JSON Schema (u otro formato equivalente, pero el MVP usará JSON Schema draft-07+).
- El motor de ejecución en Python:
  - Validará los inputs contra los schemas antes de hacer la llamada HTTP.
  - Validará la respuesta contra `outputSchema` (opcionalmente, con niveles de rigor configurables).
- El frontend (Nuxt + Vuetify):
  - Usará estos schemas para generar formularios dinámicos para probar acciones y configurar steps en workflows.

---

## 4. Action testing endpoint y compatibilidad de versiones

### 4.1 Action testing endpoint

Checklist item: **“Action testing endpoint (manual execution with sample inputs).”**

- A nivel de diseño:
  - Se expondrá en GraphQL un mutation del estilo `testAction(actionId, input, connectionId)` que:
    1. Valida `input` contra los schemas de la `Action`.
    2. Construye la request real (endpoint, path, query, headers, body).
    3. Ejecuta la operación contra el sistema externo usando una `Connection` seleccionada.
    4. Devuelve resultado + logs básicos (status code, headers clave, cuerpo truncado).
- El modelo `Action` ya contiene toda la metadata necesaria para construir esta operación.

### 4.2 Action version compatibility strategy

Checklist item: **“Action version compatibility strategy.”**

- Estrategia a nivel de diseño:
  - Las acciones se asocian a `AppVersion` – cuando cambia el contrato de un App (p.ej. cambia la forma de autenticación o de la API), se crea una nueva `AppVersion` y nuevas `Action`s para esa versión.
  - Los Workflows hacen referencia a acciones específicas (por `Action.id`), por lo que:
    - Flujos existentes siguen usando la versión anterior de la acción sin romperse.
    - Nuevos flujos pueden optar por usar las nuevas acciones asociadas a la última `AppVersion`.
  - Eventualmente se podrán marcar acciones antiguas como no disponibles para nuevos workflows, manteniendo compatibilidad hacia atrás.

---

## 5. Cómo esto cumple la sección 2.3

- **CRUD for `Action`**:  
  - Modelo `Action` definido con claves, índices y FKs → CRUD posible desde GraphQL/Prisma.

- **Action bound to a specific app version**:  
  - Campo `appVersionId` + FK a `AppVersion`.

- **Action metadata** (todos los subpuntos):  
  - `method`: `Action.method` (`HttpMethod` enum).  
  - `endpoint template`: `Action.endpointTemplate`.  
  - `headers template`: `Action.headersTemplate`.  
  - `query/path/body schema`: `Action.querySchema`, `Action.pathSchema`, `Action.bodySchema`.  
  - `output schema`: `Action.outputSchema`.  
  - `retry policy defaults`: `retryStrategy`, `maxAttempts`, `initialDelayMs`, `maxDelayMs`.  
  - `timeout defaults`: `timeoutMs`.

- **Input/output schema validation**:  
  - Los schemas JSON almacenados en los campos `*_Schema` se usarán en el runner Python para validación de entradas/salidas.

- **Action testing endpoint**:  
  - Diseñado como mutation GraphQL específica que usa la metadata de `Action`; pendiente de implementación en la parte de API.

- **Action version compatibility strategy**:  
  - Resuelta a nivel de diseño mediante el vínculo `Action` → `AppVersion` y referencia estable de acciones desde workflows.

Con esto, la sección **2.3 Actions** queda especificada a nivel de modelo de datos y diseño de comportamiento. La implementación GraphQL/runner vendrá en las secciones de API y ejecución.

