# Part 6 – Data Model Specification Checklist

This document maps the **data model specification** (section 6 of the main checklist) to the implemented Prisma schema and MongoDB design. It confirms primary keys, unique constraints, tenant-scoped indexes, and timestamps for each entity.

---

## 1. PostgreSQL Models (Prisma)

All entities below are defined in `api/prisma/schema.prisma` and mapped to PostgreSQL tables.

| Model | Primary key | Unique constraints | Tenant-scoped indexes | Timestamps |
|-------|-------------|--------------------|------------------------|------------|
| **Tenant** | `id` (uuid) | `slug` | — | createdAt, updatedAt |
| **User** | `id` (uuid) | `email` | — | createdAt, updatedAt |
| **Membership** | `id` (uuid) | (tenantId, userId) | tenantId, userId | createdAt, updatedAt |
| **AuditEvent** | `id` (uuid) | — | tenantId, (tenantId, createdAt) | createdAt |
| **Invitation** | `id` (uuid) | token, (tenantId, email) | tenantId, token | createdAt |
| **App** | `id` (uuid) | (tenantId, key) | tenantId | createdAt, updatedAt |
| **AppVersion** | `id` (uuid) | (appId, version) | appId | createdAt, updatedAt, publishedAt |
| **Action** | `id` (uuid) | (appVersionId, key) | appVersionId | createdAt, updatedAt |
| **Connection** | `id` (uuid) | — | (tenantId, appId), (tenantId, appId, isActive) | createdAt, updatedAt, rotatedAt |
| **Workflow** | `id` (uuid) | (tenantId, key) | tenantId | createdAt, updatedAt |
| **WorkflowVersion** | `id` (uuid) | (workflowId, version) | workflowId | createdAt, publishedAt |
| **Trigger** | `id` (uuid) | (tenantId, key) | (tenantId, workflowId), (tenantId, type, isActive) | createdAt, updatedAt |
| **WorkflowRun** | `id` (uuid) | — | (tenantId, workflowId), (tenantId, status), (tenantId, idempotencyKey) | createdAt, updatedAt, startedAt, finishedAt, canceledAt |
| **StepRun** | `id` (uuid) | — | workflowRunId, (workflowRunId, stepKey) | createdAt, updatedAt, startedAt, finishedAt |

- **Primary keys:** All models use `id` with `@default(uuid())`.
- **Uniques:** As above; composite uniques enforce business rules (e.g. one membership per user per tenant, one app key per tenant).
- **Tenant-scoped indexes:** All tenant-owned tables have at least one index involving `tenantId` for efficient filtering by tenant.
- **Timestamps:** `createdAt`/`updatedAt` (and where relevant `publishedAt`, `startedAt`, `finishedAt`, `canceledAt`, `rotatedAt`, `expiresAt`, `acceptedAt`) are defined. **Actor IDs:** AuditEvent has `userId`; Invitation has `createdByUserId`. Other models can add `createdBy`/`updatedBy` later if needed.
- **Soft-delete:** Not implemented globally. Optional: add `deletedAt` (and index) to App, Workflow, Connection, etc., when soft-delete is required.

---

## 2. ExecutionLog (MongoDB)

- **Storage:** MongoDB collection `execution_logs` (see [ARCHITECTURE_STORAGE.md](./ARCHITECTURE_STORAGE.md)).
- **Logical fields:** tenantId, workflowRunId, stepRunId, level, message, context, timestamp.
- **Indexes:** (tenantId, workflowRunId), (tenantId, workflowRunId, stepRunId), (tenantId, level), timestamp (with TTL for retention).
- **Checklist:** ExecutionLog is specified and implemented in MongoDB for high-volume logs.

---

## 3. SecretRef

- **Design decision:** There is no separate `SecretRef` table. Secrets are stored as **encrypted blobs** in:
  - **Connection:** `secretCipher` (and optional metadata such as `secretVersion`, `rotatedAt`).
  - **Trigger:** `webhookSecretCipher` for webhook signature verification.
- **Resolution:** Applications resolve “secret references” by loading the corresponding Connection or Trigger and decrypting the cipher blob (e.g. via KMS/Vault). References in workflow `envConfig` point to Connection IDs or named refs that the runner resolves at runtime.
- **Checklist:** SecretRef is satisfied by this design (encrypted storage and runtime resolution).

---

## 4. ApiToken / Service Credentials

- **Purpose:** Programmatic access (e.g. API keys or service accounts for CI, integrations, or Hasura).
- **Status:** Not yet implemented in the schema. Recommended future model:
  - **ApiToken** (or similar): id, tenantId, name, tokenHash (hashed token), lastUsedAt, expiresAt, createdAt; unique constraint on (tenantId, name) or on a generated key; index on tenantId.
- **Checklist:** Item is **specified** here for future implementation; can be added when programmatic access is required.

---

## 5. Summary: Checklist Compliance

- **Tenant, User, Membership, AuditEvent:** Implemented in Prisma with PKs, uniques, indexes, timestamps.
- **App, AppVersion, Action, Connection, Workflow, WorkflowVersion, Trigger, WorkflowRun, StepRun:** Implemented in Prisma with PKs, uniques, tenant-related indexes, timestamps.
- **ExecutionLog:** Implemented in MongoDB with schema and indexes.
- **SecretRef:** Designed via encrypted fields on Connection and Trigger; no separate table.
- **ApiToken:** Specified for future use; to be added when needed.
- **For each model:** Primary keys and unique constraints defined; tenant-scoped indexes where applicable; created/updated (and relevant) timestamps and actor IDs where applicable; soft-delete left optional.

This completes **6) Data Model Specification Checklist**.
