# Part 2.6 – Triggers

This document defines how **Triggers** are modeled and how they satisfy the checklist items in section **2.6 Triggers**.

---

## 1. Overview

A **Trigger** defines **how** and **when** a workflow starts:

- **Manual trigger** – user clicks \"Run\" in the UI.
- **Webhook trigger** – external systems call a signed HTTP endpoint.
- **Scheduled trigger (cron)** – periodic execution based on a cron expression.

Triggers are:

- Tenant-scoped.
- Linked to a specific `Workflow` (which in turn uses its latest active `WorkflowVersion` unless a specific version is chosen).
- Individually activable/desactivable (`isActive`).

---

## 2. Prisma data model

Defined in `api/prisma/schema.prisma`:

```prisma
enum TriggerType {
  MANUAL
  WEBHOOK
  CRON
}

model Trigger {
  id                    String       @id @default(uuid())
  tenantId              String       @map("tenant_id")
  workflowId            String       @map("workflow_id")
  key                   String
  name                  String
  description           String?
  type                  TriggerType
  isActive              Boolean      @default(true) @map("is_active")
  manualAllowed         Boolean      @default(false) @map("manual_allowed")
  webhookPath           String?      @map("webhook_path")
  webhookSecretCipher   Bytes?       @map("webhook_secret_cipher")
  webhookSignatureHeader String?     @map("webhook_signature_header")
  cronExpression        String?      @map("cron_expression")
  cronTimezone          String?      @map("cron_timezone")
  createdAt             DateTime     @default(now())
  updatedAt             DateTime     @updatedAt

  tenant   Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  workflow Workflow @relation(fields: [workflowId], references: [id], onDelete: Cascade)

  @@unique([tenantId, key])
  @@index([tenantId, workflowId])
  @@index([tenantId, type, isActive])
  @@map("triggers")
}
```

---

## 3. Manual trigger

Checklist item: **“Manual trigger.”**

- `Trigger.type = MANUAL` y/o `manualAllowed = true` indican que:
  - El workflow se puede lanzar manualmente desde la UI.
  - La UI (Nuxt + Vuetify) mostrará un botón \"Run\" para triggers manuales activos.
- Llamada GraphQL propuesta:
  - `runWorkflowManually(triggerId, input)`:
    - Valida que:
      - El Trigger exista, pertenezca al tenant del usuario, `type = MANUAL` o `manualAllowed = true` y `isActive = true`.
    - Valida `input` contra `WorkflowVersion.parameterSchema`.
    - Crea un `WorkflowRun` (diseñado en 2.7) asociado al Trigger.

---

## 4. Webhook trigger (signed endpoint validation)

Checklist item: **“Webhook trigger (signed endpoint validation).”**

- `Trigger.type = WEBHOOK`.
- Campos relevantes:
  - `webhookPath`: path único relativo, p.ej. `/hooks/<slug>`.
  - `webhookSecretCipher`: blob cifrado con el secreto usado para firmar/verificar.
  - `webhookSignatureHeader`: nombre del header donde el cliente envía la firma (p.ej. `X-Webhook-Signature`).

### Flujo de validación (diseño):

1. Petición HTTP entrante al endpoint de webhooks:
   - Path resuelve a un `Trigger` activo (`type = WEBHOOK`, `isActive = true`).
2. El servicio:
   - Lee el cuerpo bruto (raw body) y el valor del header `webhookSignatureHeader`.
   - Desencripta `webhookSecretCipher` usando KMS/Vault.
   - Calcula una firma HMAC (p.ej. `HMAC-SHA256`) sobre el cuerpo con el secreto.
   - Compara de forma segura (tiempo constante) con la firma recibida.
3. Si la firma es válida:
   - Continúa y crea un `WorkflowRun`.
4. Si la firma es inválida:
   - Responde con 401/403 y no crea run.

Esto cumple el requisito de **endpoint firmado**; el tipo exacto de firma (HMAC, timestamp, etc.) puede configurarse por App en el futuro, pero la base de secreto cifrado + header dedicado ya está diseñada.

---

## 5. Scheduled trigger (cron)

Checklist item: **“Scheduled trigger (cron).”**

- `Trigger.type = CRON`.
- Campos relevantes:
  - `cronExpression`: expresión cron (p.ej. `0 * * * *` para cada hora).
  - `cronTimezone`: zona horaria IANA (p.ej. `UTC`, `America/Mexico_City`).
- Un scheduler (servicio aparte) se encargará de:
  - Leer triggers `type = CRON AND isActive = true`.
  - Evaluar la expresión cron según `cronTimezone`.
  - Crear `WorkflowRun` cuando toque (igual que manual/webhook, pero iniciado por el scheduler).

---

## 6. Trigger activation/deactivation

Checklist item: **“Trigger activation/deactivation controls.”**

- Campo `isActive: Boolean`:
  - Cuando `false`, el trigger no dispara runs:
    - Manual: la UI oculta o deshabilita el botón Run.
    - Webhook: las peticiones se rechazan (p.ej. 404 o 410).
    - Cron: el scheduler ignora el trigger.
- Operaciones GraphQL previstas:
  - `setTriggerActive(triggerId, isActive)` con permisos adecuados.

---

## 7. Trigger run history and diagnostics

Checklist item: **“Trigger run history and diagnostics.”**

- Aunque la persistencia de runs se detalla en 2.7, a nivel de diseño:
  - Cada `WorkflowRun` tendrá un `triggerId` opcional que referencia al `Trigger` que lo originó.
  - La API permitirá:
    - Listar runs filtrando por `triggerId`.
    - Ver estadísticas por trigger (número de ejecuciones, últimos estados, errores más frecuentes).
- El modelo `Trigger` está preparado para esto mediante:
  - Clave primaria estable (`id`) usada en `WorkflowRun`.
  - Índices que facilitan queries por `tenantId`, `workflowId`, `type`, `isActive`.

Detalles concretos de `WorkflowRun`/`StepRun`/`ExecutionLog` se definen en la sección 2.7, pero el diseño de `Trigger` ya soporta el historial y diagnóstico por trigger.

---

## 8. Cómo esto cumple la sección 2.6

- **Manual trigger**:
  - `Trigger.type = MANUAL` o `manualAllowed = true`, con ejecución mediante mutation GraphQL manual.

- **Webhook trigger (signed endpoint validation)**:
  - `type = WEBHOOK`, `webhookPath`, `webhookSecretCipher` (cifrado), `webhookSignatureHeader`.  
  - Flujo de firma HMAC con secreto cifrado.

- **Scheduled trigger (cron)**:
  - `type = CRON`, `cronExpression`, `cronTimezone`, y un scheduler que los ejecute.

- **Trigger activation/deactivation controls**:
  - `isActive` controla si el trigger está operativo para manual/webhook/cron.

- **Trigger run history and diagnostics**:
  - Diseño previsto con `triggerId` en `WorkflowRun` y capacidad de filtrado/estadísticas.

Con esto, la sección **2.6 Triggers** queda especificada a nivel de modelo de datos y diseño funcional.

