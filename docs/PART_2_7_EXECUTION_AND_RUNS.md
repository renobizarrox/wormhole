# Part 2.7 – Execution and Runs

This document defines how **WorkflowRun**, **StepRun**, and **ExecutionLog** work together to satisfy the checklist items in section **2.7 Execution and Runs**.

---

## 1. Overview

Execution model (alto nivel):

- Cada disparo de un trigger crea un **WorkflowRun**.
- Cada WorkflowRun tiene una secuencia (o grafo) de **StepRun** asociados a los nodos del `WorkflowVersion.graph`.
- Toda la actividad se registra en **ExecutionLog** con contexto de run/step.

Objetivos:

- Estados claros por run y por step.
- Retrys controlados con backoff.
- Timeouts por paso y por workflow.
- Idempotencia para evitar ejecuciones duplicadas.
- Cancelación segura.
- Logs estructurados para debugging y auditoría.

---

## 2. Prisma data model

Defined in `api/prisma/schema.prisma`:

```prisma
enum RunStatus {
  QUEUED
  RUNNING
  SUCCESS
  FAILED
  CANCELED
}

enum StepRunStatus {
  QUEUED
  RUNNING
  SUCCESS
  FAILED
  SKIPPED
  CANCELED
}

enum LogLevel {
  DEBUG
  INFO
  WARN
  ERROR
}

model WorkflowRun {
  id               String     @id @default(uuid())
  tenantId         String     @map("tenant_id")
  workflowId       String     @map("workflow_id")
  workflowVersionId String    @map("workflow_version_id")
  triggerId        String?    @map("trigger_id")
  status           RunStatus  @default(QUEUED)
  idempotencyKey   String?    @map("idempotency_key")
  input            Json?      @map("input")
  startedAt        DateTime?  @map("started_at")
  finishedAt       DateTime?  @map("finished_at")
  canceledAt       DateTime?  @map("canceled_at")
  errorCode        String?    @map("error_code")
  errorMessage     String?    @map("error_message")
  createdAt        DateTime   @default(now())
  updatedAt        DateTime   @updatedAt

  tenant          Tenant         @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  workflow        Workflow       @relation(fields: [workflowId], references: [id], onDelete: Cascade)
  workflowVersion WorkflowVersion @relation(fields: [workflowVersionId], references: [id], onDelete: Cascade)
  trigger         Trigger?       @relation(fields: [triggerId], references: [id], onDelete: SetNull)
  steps           StepRun[]
  logs            ExecutionLog[]

  @@index([tenantId, workflowId])
  @@index([tenantId, status])
  @@index([tenantId, idempotencyKey])
  @@map("workflow_runs")
}

model StepRun {
  id             String        @id @default(uuid())
  workflowRunId  String        @map("workflow_run_id")
  stepKey        String        @map("step_key")
  actionId       String?       @map("action_id")
  status         StepRunStatus @default(QUEUED)
  attempt        Int           @default(1)
  startedAt      DateTime?     @map("started_at")
  finishedAt     DateTime?     @map("finished_at")
  errorCode      String?       @map("error_code")
  errorMessage   String?       @map("error_message")
  input          Json?         @map("input")
  output         Json?         @map("output")
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  workflowRun WorkflowRun @relation(fields: [workflowRunId], references: [id], onDelete: Cascade)
  action      Action?     @relation(fields: [actionId], references: [id], onDelete: SetNull)
  logs        ExecutionLog[]

  @@index([workflowRunId])
  @@index([workflowRunId, stepKey])
  @@map("step_runs")
}

model ExecutionLog {
  id            String    @id @default(uuid())
  tenantId      String    @map("tenant_id")
  workflowRunId String    @map("workflow_run_id")
  stepRunId     String?   @map("step_run_id")
  level         LogLevel  @map("level")
  message       String
  context       Json?     @map("context")
  timestamp     DateTime  @default(now())

  tenant      Tenant      @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  workflowRun WorkflowRun @relation(fields: [workflowRunId], references: [id], onDelete: Cascade)
  stepRun     StepRun?    @relation(fields: [stepRunId], references: [id], onDelete: SetNull)

  @@index([tenantId, workflowRunId])
  @@index([tenantId, workflowRunId, stepRunId])
  @@index([tenantId, level])
  @@map("execution_logs")
}
```

---

## 3. Create WorkflowRun per trigger event

Checklist item: **“Create `WorkflowRun` record per trigger event.”**

- Cada vez que un **Trigger** (manual/webhook/cron) se dispara:
  - Se crea un `WorkflowRun` con:
    - `tenantId`, `workflowId`, `workflowVersionId` (generalmente la `isLatest` activa).
    - `triggerId` (si aplica).
    - `status = QUEUED`.
    - `input` = payload de entrada (validado contra `parameterSchema`).
    - `idempotencyKey`, si se proporciona (ver idempotencia abajo).

---

## 4. Per-step execution state machine

Checklist item: **“Per-step execution state machine: queued, running, success, failed, skipped, canceled.”**

- `StepRun.status: StepRunStatus` cubre:
  - `QUEUED`: pendiente de ejecución.
  - `RUNNING`: en curso.
  - `SUCCESS`: completado correctamente.
  - `FAILED`: falló de forma terminal (tras reintentos).
  - `SKIPPED`: no ejecutado por condición lógica o fallo previo.
  - `CANCELED`: cancelado explícitamente (por cancelación de run).
- Los campos `startedAt`, `finishedAt`, `attempt`, `errorCode`, `errorMessage`, `input`, `output` permiten:
  - Trazar duración, intentos y errores por paso.

---

## 5. Retry policy y timeouts

Checklist items:
- **“Retry policy (attempt count + exponential backoff).”**
- **“Timeout handling per step and per workflow.”**

### 5.1 Retry

- La política de retry base está en `Action` (ver sección 2.3):
  - `retryStrategy`, `maxAttempts`, `initialDelayMs`, `maxDelayMs`.
- El motor de ejecución:
  - Incrementa `StepRun.attempt` en cada reintento.
  - Mantiene `StepRun.status` en `QUEUED`/`RUNNING` hasta que:
    - éxito → `SUCCESS`.
    - se agotan intentos → `FAILED`.
- El backoff (fijo o exponencial) se calcula a partir de los campos del `Action`; esto controla cuándo se reencola el StepRun tras un fallo.

### 5.2 Timeouts

- Por **step**:
  - `Action.timeoutMs` define el límite máximo por request en ms.
  - Si se excede, el runner:
    - Aborta la llamada externa.
    - Marca el StepRun como `FAILED` (o reintenta, según política).
- Por **workflow**:
  - Se puede implementar un timeout global por run (p.ej. configurable más adelante).
  - Si se supera, el motor puede:
    - Marcar `WorkflowRun.status = CANCELED` o `FAILED` según la causa.
    - Marcar steps pendientes como `CANCELED` o `SKIPPED`.

---

## 6. Idempotency key support

Checklist item: **“Idempotency key support for external calls.”**

- `WorkflowRun.idempotencyKey: String?`:
  - Asignado opcionalmente cuando se dispara el workflow (especialmente para triggers idempotentes como webhooks).
  - Permite:
    - Detectar si ya existe un run con la misma combinación (`tenantId`, `idempotencyKey`).
    - Evitar crear un nuevo run, devolviendo el anterior o marcando duplicado.
- Estrategia típica:
  - Para webhooks, el idempotency key puede venir de un header o field específico (definido por el App).

---

## 7. Run cancellation support

Checklist item: **“Run cancellation support.”**

- `WorkflowRun.canceledAt` y `WorkflowRun.status = CANCELED`:
  - Una mutation GraphQL `cancelWorkflowRun(runId)`:
    - Marca el run como `CANCELED`.
    - Señala al motor de ejecución para:
      - No empezar nuevos steps.
      - Intentar detener steps en curso (en la medida posible).
  - Los StepRuns pendientes se marcan como `CANCELED` o `SKIPPED`, según el caso.

---

## 8. Structured logs at run and step level

Checklist item: **“Structured logs at run and step level.”**

- `ExecutionLog`:
  - `tenantId`, `workflowRunId`, `stepRunId?`.
  - `level: LogLevel` (`DEBUG`, `INFO`, `WARN`, `ERROR`).
  - `message: String`.
  - `context: Json?` – detalles estructurados (ej. statusCode, headers truncados, payloads truncados, ids externos).
  - `timestamp`.
- Uso:
  - Logs de nivel run (sin `stepRunId`) para eventos globales (inicio/fin, cancelación, reintentos globales).
  - Logs de nivel step (con `stepRunId`) para cada acción ejecutada.
  - Filtrado por tenant/run/step y nivel facilita diagnóstico y observabilidad.

---

## 9. Cómo esto cumple la sección 2.7

- **Create `WorkflowRun` record per trigger event**:
  - `WorkflowRun` creado por cada disparo, con `triggerId`, `workflowVersionId` y `input`.

- **Per-step execution state machine**:
  - `StepRunStatus` cubre `queued`, `running`, `success`, `failed`, `skipped`, `canceled`.

- **Retry policy**:
  - Intentos en `StepRun.attempt` + política en `Action.retry*` (backoff fijo/exponencial).

- **Timeout handling**:
  - `Action.timeoutMs` por step; posible timeout global por run.

- **Idempotency key support**:
  - `WorkflowRun.idempotencyKey` + índices para detectar duplicados por tenant.

- **Run cancellation support**:
  - `WorkflowRun.canceledAt` y estado `CANCELED`, con propagación a steps.

- **Structured logs at run and step level**:
  - `ExecutionLog` con `level`, `message`, `context` y referencias a run/step.

Con esto, la sección **2.7 Execution and Runs** queda definida a nivel de modelo y comportamiento, lista para ser implementada en el motor de ejecución Python y la API GraphQL.

