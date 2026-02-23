# Part 4.4 – Messaging and Storage

This document specifies **messaging** (queues) and **storage** (PostgreSQL, MongoDB, optional S3) for the Wormhole platform. It extends [ARCHITECTURE_STORAGE.md](./ARCHITECTURE_STORAGE.md) with queue design and optional object storage.

---

## 1. PostgreSQL (Transactional Metadata)

**Status:** Mandatory.

- **Role:** Single source of truth for all transactional and relational data.
- **Contents:** Tenants, Users, Memberships, Invitations, Apps, AppVersions, Actions, Connections, Workflows, WorkflowVersions, Triggers, WorkflowRuns, StepRuns, AuditEvents.
- **Access:** Exposed via **Hasura GraphQL**; schema auto-generated from tables. Custom mutations/queries via Hasura Actions (Node.js) where needed.
- **Operational:** Backed up regularly; migrations via Prisma. Deployed as a container (e.g. Coolify) or managed service.

**Checklist:** PostgreSQL for all transactional metadata (mandatory) – exposed via Hasura GraphQL.

---

## 2. MongoDB (Execution Logs)

**Status:** Mandatory for execution logs.

- **Role:** High-volume, append-heavy execution logs with fast reads by tenant/run/step.
- **Contents:** `execution_logs` collection (tenantId, workflowRunId, stepRunId, level, message, context, timestamp). See [ARCHITECTURE_STORAGE.md](./ARCHITECTURE_STORAGE.md) for schema and indexes.
- **Access:** Written by the Python runner; read by the control plane (Node.js) and exposed to the frontend via Hasura Actions or a Remote Schema.
- **Operational:** TTL index on `timestamp` for retention; deployed as a container (e.g. Coolify) or managed service.

**Checklist:** MongoDB for execution logs – high-volume writes, fast queries, NoSQL schema flexibility.

---

## 3. Redis / BullMQ (Queueing)

**Status:** Mandatory for job queue.

- **Role:** Durable (persistence enabled) job queue for workflow runs and other async work.
- **Technology choice:** **Redis** as the broker, with **BullMQ** (Node.js) for producing and consuming jobs. Alternative: **RabbitMQ** if stronger guarantees or different topology are needed later.
- **Queues:**
  - **workflow_runs:** Jobs to execute a workflow run (payload: workflowRunId, workflowVersionId, tenantId, input). Consumed by the Python runner (via a small Node bridge or a Redis client in Python, e.g. BullMQ-compatible or raw Redis LIST).
  - **dlq** (dead-letter queue): Failed jobs after max retries for inspection/replay.
- **Flow:**
  - Control plane (Node.js) creates a WorkflowRun in PostgreSQL and enqueues a job to `workflow_runs`.
  - Runner (Python) dequeues, executes, updates run/step status in PostgreSQL and writes logs to MongoDB. On repeated failure, job is moved to DLQ.
- **Operational:** Redis with persistence (RDB or AOF). Single instance for MVP; Redis Cluster or managed Redis for scale. Deployed as a container (e.g. Coolify) or managed service.

**Checklist:** Redis/BullMQ or RabbitMQ for queueing.

---

## 4. S3-Compatible Object Storage (Optional)

**Status:** Optional.

- **Role:** Large payloads and artifacts that should not live in PostgreSQL or MongoDB (e.g. workflow input/output blobs above a size threshold, export files, backup artifacts).
- **Use cases:**
  - Store `WorkflowRun.input` or step outputs when payload size exceeds a limit (e.g. 1 MB); store a reference (e.g. S3 key) in PostgreSQL.
  - Export/import of workflows or audit dumps.
- **Technology:** Any S3-compatible service (AWS S3, MinIO, Cloudflare R2, etc.). Not required for MVP; can be added when large-payload requirements appear.
- **Access:** Control plane and runner obtain pre-signed URLs or use IAM/credentials to read/write; never expose raw credentials to the frontend.

**Checklist:** S3-compatible object storage for large payloads/artifacts (optional).

---

## 5. Summary Table

| Component        | Purpose                    | Mandatory | Exposed via / Consumer        |
|-----------------|----------------------------|-----------|------------------------------|
| PostgreSQL      | Transactional metadata    | Yes       | Hasura GraphQL               |
| MongoDB         | Execution logs            | Yes       | Runner (write); Node (read)  |
| Redis + BullMQ  | Workflow run job queue    | Yes       | Node (produce); Runner (consume) |
| S3-compatible   | Large payloads/artifacts   | No        | Control plane, runner        |

---

## 6. How This Satisfies Checklist 4.4

- **PostgreSQL** for all transactional metadata (mandatory) – exposed via Hasura GraphQL: defined and in use.
- **MongoDB** for execution logs: defined (schema, indexes, TTL) and used by runner + control plane.
- **Redis/BullMQ or RabbitMQ** for queueing: Redis + BullMQ chosen; queue names and flow described; DLQ included.
- **S3-compatible** object storage: optional; use cases and access pattern described for when it is introduced.

This completes **4.4 Messaging and Storage**.
