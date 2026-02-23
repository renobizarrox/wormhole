# Part 2.5 – Workflows

This document defines how **Workflows** are modeled and how they satisfy the checklist items in section **2.5 Workflows**.

---

## 1. Overview

A **Workflow** is a tenant-scoped automation:

- Has a stable identity (`Workflow.key`) and human name/description.
- Has one or more immutable **WorkflowVersions**, each containing:
  - A **graph** of steps (nodes/edges) – linear in MVP, extensible to branching.
  - A **parameter schema** (runtime input to the workflow).
  - An **env config** describing environment variables and secret references used by the workflow.

Triggers (manual/webhook/cron) will target a specific `Workflow` and, at runtime, the **latest active version** or an explicit version (handled in later sections).

---

## 2. Prisma data model

Defined in `api/prisma/schema.prisma`:

```prisma
enum WorkflowStatus {
  Draft
  Active
  Archived
}

model Workflow {
  id          String          @id @default(uuid())
  tenantId    String          @map("tenant_id")
  key         String
  name        String
  description String?
  status      WorkflowStatus  @default(Draft)
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt

  tenant   Tenant           @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  versions WorkflowVersion[]

  @@unique([tenantId, key])
  @@index([tenantId])
  @@map("workflows")
}

model WorkflowVersion {
  id               String   @id @default(uuid())
  workflowId       String   @map("workflow_id")
  version          Int
  graph            Json     @map("graph")              // definition of nodes/edges/steps
  parameterSchema  Json?    @map("parameter_schema")   // JSON Schema for runtime input
  envConfig        Json?    @map("env_config")         // environment vars + secret refs
  isLatest         Boolean  @default(false) @map("is_latest")
  createdAt        DateTime @default(now())
  publishedAt      DateTime?

  workflow Workflow @relation(fields: [workflowId], references: [id], onDelete: Cascade)

  @@unique([workflowId, version])
  @@index([workflowId])
  @@map("workflow_versions")
}
```

---

## 3. CRUD for Workflow

Checklist item: **“CRUD for `Workflow`.”**

- `Workflow` es la entidad principal:
  - `tenantId` – scoping por tenant.
  - `key` – slug único por tenant (`@@unique([tenantId, key])`).
  - `name`, `description`.
  - `status: WorkflowStatus` (`Draft`, `Active`, `Archived`).
- Operaciones previstas (GraphQL):
  - `createWorkflow(tenantId, key, name, description?)`.
  - `updateWorkflow(id, name?, description?, status?)`.
  - `archiveWorkflow(id)` (cambia `status` a `Archived`).
  - `deleteWorkflow(id)` (suprime workflow + versiones si procede).

---

## 4. Graph builder support (linear + branching)

Checklist item: **“Workflow graph builder support: linear step sequences in MVP; optional branching/conditions in phase 2.”**

- Campo `WorkflowVersion.graph: Json` almacena la definición de grafo:
  - MVP: representará una **secuencia lineal** de pasos:
    - Estructura sugerida:
      - `nodes`: lista de pasos (`id`, `type`, `actionId`, etc.).
      - `edges`: lista de relaciones entre nodos, que en MVP será simplemente `start -> step1 -> step2 -> ... -> end`.
  - Fase 2: el mismo esquema se puede extender para incluir:
    - Condiciones en edges (p.ej. `onSuccess`, `onFailure`, expresiones).
    - Bifurcaciones y joins.
- El **workflow builder** en Nuxt + Vuetify consumirá y producirá este JSON; el runner Python lo interpretará para ejecutar pasos en orden.

---

## 5. Workflow versioning (immutable published versions)

Checklist item: **“Workflow versioning (immutable published versions).”**

- `WorkflowVersion`:
  - `workflowId`: relación al `Workflow` padre.
  - `version`: entero incremental (único por workflow).
  - `graph`, `parameterSchema`, `envConfig`: snapshot completo de la definición de ese workflow.
  - `isLatest`: marca la versión que se considera \"última\" para ejecuciones por defecto.
  - `publishedAt`: marca cuándo se publicó esa versión.
- Regla de inmutabilidad:
  - Una vez publicada una versión (con `publishedAt` no nulo), sus campos de grafo/parámetros/env **no se modifican**.
  - Cualquier cambio se hace creando una **nueva `WorkflowVersion`** con `version = versión_anterior + 1`.
- Los Workflows en ejecución referenciarán una versión concreta:
  - Esto garantiza reproducibilidad y trazabilidad (los runs y steps usarán el grafo de esa versión).

---

## 6. Parameterization (runtime input variables)

Checklist item: **“Parameterization (runtime input variables).”**

- `WorkflowVersion.parameterSchema: Json?`:
  - Contiene un JSON Schema que describe la forma del input de ejecución del workflow.
  - Ejemplos:
    - Campos como `customerId`, `startDate`, `endDate`, etc.
  - El frontend genera formularios dinámicos para lanzar workflows manualmente.
- En la ejecución:
  - El runner valida el input contra `parameterSchema` antes de iniciar el grafo.
  - Los pasos pueden referenciar estos parámetros (p.ej. en mapeos de cuerpos de acciones).

---

## 7. Environment variables and secret references

Checklist item: **“Environment variables and secret references.”**

- `WorkflowVersion.envConfig: Json?`:
  - Estructura propuesta:
    - `env`: pares `name -> value` (no secreto).
    - `secrets`: pares `name -> { connectionId?, secretRefKey?, description? }`.
  - Esto permite:
    - Configuración estática por workflow (p.ej. `region`, `baseUrl`).
    - Referencias a secretos externos (p.ej. credenciales en `Connection` o futuras `SecretRef`).
- El runner:
  - Resuelve estas refs a valores reales (p.ej. leyendo de conexiones, KMS, etc.).
  - Inyecta estas variables en el contexto de ejecución de cada paso.

---

## 8. Cómo esto cumple la sección 2.5

- **CRUD for `Workflow`**:
  - `Workflow` + `WorkflowStatus` + `tenantId/key` cubren el modelo y permiten CRUD completo.

- **Workflow graph builder support**:
  - `WorkflowVersion.graph` modela el grafo de pasos y edges.
  - MVP: grafos lineales; Fase 2: condiciones y branching usando la misma estructura.

- **Workflow versioning (immutable)**:
  - `WorkflowVersion` con `version`, `isLatest`, `publishedAt`.
  - Política de no mutar versiones publicadas; en su lugar, nuevas versiones.

- **Parameterization (runtime input variables)**:
  - `parameterSchema` como JSON Schema para inputs de ejecución.

- **Environment variables and secret references**:
  - `envConfig` agrupa env vars y referencias a secretos/conexiones, resueltas en el runner.

Con esto, la sección **2.5 Workflows** queda definida a nivel de modelo de datos y diseño funcional. La ejecución concreta de workflows (runs, steps, logs) se cubrirá en la sección 2.7.

