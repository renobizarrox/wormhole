# Part 4.2 – Control Plane API (Hasura GraphQL + Node.js/TypeScript)

This document describes the **control plane**: how Hasura GraphQL and a Node.js/TypeScript service work together to expose and orchestrate the platform’s core capabilities.

---

## 1. High-Level Architecture

- **Hasura GraphQL Engine**
  - Connects directly to **PostgreSQL**.
  - Auto-generates a **GraphQL schema** from tables defined by Prisma models.
  - Enforces **row-level security** and **column-level permissions** via roles and session variables.

- **Node.js/TypeScript Service (Custom Actions & Webhooks)**
  - Implements business logic that cannot be expressed purely as CRUD on tables:
    - Authentication and JWT issuance.
    - Complex workflows (inviting users, testing connections, running workflows).
    - Webhook trigger intake and validation.
    - Orchestration of workflow runs (enqueue, status updates).
  - Exposed to Hasura via:
    - **Hasura Actions** (GraphQL mutations/queries backed by HTTP handlers).
    - **Event triggers** (DB changes that call HTTP endpoints).
    - **Scheduled triggers** (cron jobs that call HTTP endpoints).

- **MongoDB (Execution Logs)**
  - Accessed either:
    - Directly by Node.js for log queries.
    - Or via Hasura Remote Schemas / Actions that proxy MongoDB queries.

---

## 2. Hasura GraphQL as Primary API Layer

### 2.1 Schema Generation

- Hasura connects to the same PostgreSQL database used by Prisma.
- Tables involved:
  - `tenants`, `users`, `memberships`, `invitations`
  - `apps`, `app_versions`, `actions`
  - `connections`
  - `workflows`, `workflow_versions`, `triggers`
  - `workflow_runs`, `step_runs`
  - `audit_events`
- Hasura introspects these tables and auto-generates:
  - Queries (e.g. `apps`, `workflows`, `workflow_runs`).
  - Mutations (insert/update/delete).
  - Relationships (joins based on FKs).

### 2.2 Permissions and Multi-Tenancy

- Hasura uses **session variables** (e.g. `x-hasura-user-id`, `x-hasura-tenant-id`, `x-hasura-role`) to enforce row-level security:
  - Every query is filtered by `tenant_id = x-hasura-tenant-id`.
  - Roles (`owner`, `admin`, `builder`, `viewer`) map to Hasura roles with different permissions.
- JWTs issued by the auth service include:
  - `x-hasura-user-id`
  - `x-hasura-tenant-id`
  - `x-hasura-role`
  - Any additional custom claims required.

---

## 3. Node.js/TypeScript Service (Custom Logic)

The Node service sits alongside Hasura and is responsible for **custom actions and orchestration**.

### 3.1 Authentication & RBAC

- **Login / Register** endpoints (already scaffolded in the existing Node API) become:
  - **Hasura Actions**:
    - `registerUserAndTenant` → creates `Tenant`, `User`, `Membership` and returns a JWT.
    - `login` → verifies credentials and returns a JWT with Hasura claims.
  - Direct HTTP endpoints used by the frontend that then call Hasura with the JWT.
- RBAC:
  - Role (Owner/Admin/Builder/Viewer) is included in the JWT and mapped to Hasura roles.
  - Hasura permission rules ensure only allowed tenants/rows/columns are visible.

### 3.2 Complex Mutations

Custom business operations that span multiple tables or external systems are implemented as **Hasura Actions** backed by Node handlers, for example:

- `inviteUserToTenant`:
  - Validates that caller is Owner/Admin.
  - Inserts into `invitations`.
  - Sends email with invite link (out-of-band).

- `acceptInvitation`:
  - Validates token and expiration.
  - Creates or links `User` and `Membership`.
  - Marks invitation as accepted.
  - Returns a JWT for the accepted user.

- `testConnection`:
  - Reads `Connection` + `AppVersion.authType`.
  - Decrypts secrets (via KMS/Vault).
  - Performs a small test call to external API.
  - Returns result + diagnostics.

- `runWorkflow`:
  - Given `workflowId` (and optional version), creates a `WorkflowRun`.
  - Enqueues a job for the Python runner.

All these are exposed as GraphQL mutations via Hasura Actions, so the frontend interacts with them through GraphQL.

### 3.3 Webhook Trigger Intake

- For `Trigger.type = WEBHOOK`, the **Node service** exposes HTTP endpoints:
  - Each path corresponds to `Trigger.webhookPath`.
  - The handler:
    - Looks up `Trigger` by path.
    - Validates HMAC signature using decrypted `webhookSecretCipher`.
    - Creates a `WorkflowRun` with the webhook payload as `input`.
    - Enqueues the run for execution.
- These endpoints can be registered:
  - As Hasura “actions” with `kind: synchronous` (less ideal for high throughput), or
  - As **direct Node HTTP routes** behind a reverse proxy (recommended).

### 3.4 Run Orchestration

- The Node service plays the role of the **orchestrator**:
  - Takes `WorkflowRun` records created by triggers or manual runs.
  - Enqueues jobs into Redis/BullMQ/RabbitMQ for the Python runner.
  - Receives status updates from the runner (via HTTP callbacks or queue messages).
  - Updates `WorkflowRun` and `StepRun` in PostgreSQL (via Hasura or direct Prisma).

---

## 4. MongoDB Integration (Logs)

- Execution logs (`ExecutionLog`) are written by the Python runner directly into **MongoDB**.
- To expose logs to the frontend:
  - Option 1: Hasura **Remote Schema**:
    - A small GraphQL service in Node sitting in front of MongoDB.
    - Hasura stitches it into the main GraphQL schema.
  - Option 2: Hasura **Actions** that call Node endpoints which query MongoDB.

Typical operations:

- `getRunLogs(workflowRunId)`:
  - Fetches logs from MongoDB filtered by tenant + run ID.
- `getStepLogs(stepRunId)`:
  - Fetches logs for a specific step.

These operations are read-only and optimized for fast retrieval.

---

## 5. Versioning and Publish Workflows/Apps/Actions

- Versioning is handled at the data model level:
  - `AppVersion`, `WorkflowVersion`, and `Action` per `AppVersion`.
- The control plane API exposes:
  - Mutations to **publish**:
    - `publishAppVersion(appId)` → sets `AppVersion.publishedAt` and updates `App.status`.
    - `publishWorkflowVersion(workflowId)` → sets `WorkflowVersion.isLatest = true` and `publishedAt`.
  - Queries to retrieve:
    - Latest published versions.
    - Specific versions by number.
- Hasura permissions ensure only appropriate roles (Owner/Admin/Builder) can publish.

---

## 6. How This Satisfies Checklist 4.2

Checklist items:

- **Hasura GraphQL as primary API layer over PostgreSQL**:  
  - Hasura connects to PostgreSQL and auto-generates schema; all CRUD and queries go through Hasura.

- **Auto-generated schema from Prisma models**:  
  - PostgreSQL tables (from Prisma) are introspected by Hasura, generating GraphQL types/queries/mutations.

- **Custom business logic via Hasura Actions (Node.js/TypeScript)**:  
  - Auth, RBAC, invites, test connections, run workflows, webhook intake, and orchestration are all mapped to Hasura Actions backed by Node.

- **Webhook trigger intake via dedicated HTTP endpoints**:  
  - Node provides signed webhook endpoints, integrated with Triggers and WorkflowRuns.

- **Hasura Remote Schemas/Actions for MongoDB logs**:  
  - Logs stored in MongoDB are surfaced via either Remote Schema or Actions.

- **Versioning and publish flows via GraphQL**:  
  - Mutations for publishing versions and querying latest/specific versions expose versioning through GraphQL.

This completes the **control plane API** design for section **4.2**.

