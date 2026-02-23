# Part 7 – API Surface Specification

This document specifies the **API surface** (section 7 of the main checklist): how each capability is exposed to the frontend and to external callers. The platform uses **Hasura GraphQL** as the primary API over PostgreSQL, with **Node.js** providing REST auth endpoints and **Hasura Actions** (backed by Node) for custom business logic. Webhook triggers are exposed as **direct HTTP endpoints** on the Node service.

**Reference:** [PART_4_2_CONTROL_PLANE_API.md](./PART_4_2_CONTROL_PLANE_API.md) (architecture); [PART_6_DATA_MODEL_SPECIFICATION.md](./PART_6_DATA_MODEL_SPECIFICATION.md) (entities).

---

## 1. Overview

| Layer | Purpose |
|-------|--------|
| **REST (Node)** | Auth (register, login, refresh), tenant list; webhook trigger intake. |
| **GraphQL (Hasura)** | CRUD for tenants, apps, actions, connections, workflows, triggers, runs; session-scoped by `x-hasura-tenant-id`. |
| **GraphQL Actions (Node)** | Invites, test connection, publish app/workflow, run workflow, cancel run, re-run, logs (MongoDB). |

All authenticated GraphQL requests carry a JWT with `x-hasura-user-id`, `x-hasura-tenant-id`, and `x-hasura-role`. Hasura enforces row-level security so that only data for the current tenant is visible.

---

## 2. Auth and Tenant

### 2.1 Login / Logout / Session Refresh

- **`POST /api/auth/register`** (REST, Node)  
  Body: `{ email, password, name?, tenantName, tenantSlug }`.  
  Creates Tenant, User, Membership (Owner); returns `{ token }` (JWT with Hasura claims).

- **`POST /api/auth/login`** (REST, Node)  
  Body: `{ email, password, tenantId }`.  
  Verifies credentials for that tenant; returns `{ token }`.

- **Session refresh**  
  Use the same JWT; refresh is done by re-issuing a new token (e.g. via a dedicated `POST /api/auth/refresh` that accepts a valid JWT and returns a new one with extended expiry), or by re-login.  
  *Spec:* Implement `POST /api/auth/refresh` (optional) that accepts `Authorization: Bearer <token>` and returns a new JWT.

- **Logout**  
  Client-side: discard token. No server-side session store required.

**Checklist:** Login, logout, session refresh are specified and implemented (register, login in Node; refresh optional).

### 2.2 Tenant Switch / Select

- **`GET /api/tenants`** (REST, Node)  
  Returns list of tenants (and role) for the current user: `{ items: [{ id, name, slug, role }], limit, offset }`.  
  Frontend uses this to show tenant switcher; after switch, frontend stores selected `tenantId` and includes it in login (or uses a token that encodes the selected tenant).

- **Tenant context in GraphQL**  
  The JWT used for Hasura must contain `x-hasura-tenant-id` for the **selected** tenant. So “tenant switch” means: either re-login with the new `tenantId`, or the auth service provides a way to exchange the current JWT for one with a different `x-hasura-tenant-id` (same user, different tenant).  
  *Spec:* Either login with `tenantId` per request, or add `POST /api/auth/switch-tenant` body `{ tenantId }` returning a new JWT with that tenant.

**Checklist:** Tenant switch/select is specified (GET /api/tenants; switch via login or dedicated endpoint).

### 2.3 User Invites and Role Updates

- **`inviteUserToTenant`** (GraphQL mutation, Hasura Action → Node)  
  Input: `{ tenantId, email, role }`.  
  Caller must be Owner/Admin. Creates `Invitation`, sends email with link. Returns success + invitation id.

- **`acceptInvitation`** (GraphQL mutation, Hasura Action → Node)  
  Input: `{ token }` (from email link).  
  Validates token and expiry; creates/links User and Membership; marks invitation accepted. Returns JWT for the new session.

- **Role updates**  
  Update membership role via Hasura mutation on `memberships` (e.g. `update_memberships_by_pk`), restricted by Hasura permissions so only Owner/Admin can change roles.

**Checklist:** User invites and role updates are specified (Actions for invite/accept; GraphQL mutation for role update with RBAC).

---

## 3. Apps and Actions

All app/action data is tenant-scoped via Hasura permissions. Table names in Hasura follow the database: `apps`, `app_versions`, `actions`.

### 3.1 App CRUD

| Logical operation | Exposure |
|-------------------|----------|
| **POST /apps** (create) | GraphQL mutation `insert_apps_one` (object with `tenantId` from session). |
| **GET /apps** (list) | GraphQL query `apps` (filtered by `tenant_id` via RLS). |
| **GET /apps/:id** | GraphQL query `apps_by_pk(id: $id)` (RLS ensures tenant match). |
| **PATCH /apps/:id** | GraphQL mutation `update_apps_by_pk(pk_columns: { id }, _set: { ... })`. |
| **DELETE /apps/:id** | GraphQL mutation `delete_apps_by_pk(id: $id)`. |

### 3.2 Action CRUD (per App / AppVersion)

Actions belong to `AppVersion`. Create an app version first, then attach actions.

| Logical operation | Exposure |
|-------------------|----------|
| **POST /apps/:id/actions** (create action for an app version) | GraphQL mutation `insert_actions_one` with `appVersionId` (use the desired `AppVersion.id` for that app). |
| **List actions** | GraphQL query `actions` (filter by `app_version_id` or via relation `app_versions.actions`). |
| **GET /actions/:id**, **PATCH**, **DELETE** | GraphQL `actions_by_pk` and `update_actions_by_pk` / `delete_actions_by_pk`. |

### 3.3 Test Action

- **`testAction`** (GraphQL mutation, Hasura Action → Node)  
  Input: `{ actionId, connectionId?, input? }`.  
  Resolves connection if needed, runs a minimal execution of the action (e.g. single step), returns `{ success, output?, error?, diagnostics? }`.

**Checklist:** `POST /actions/:id/test` is specified as the `testAction` Action with `actionId` (and optional connection/input).

### 3.4 Publish App

- **`publishAppVersion`** (GraphQL mutation, Hasura Action → Node)  
  Input: `{ appId, appVersionId? }`. If `appVersionId` omitted, use latest version. Sets `AppVersion.publishedAt`, updates `App.status` as needed. Returns published version.

**Checklist:** `POST /apps/:id/publish` is specified as the `publishAppVersion` Action.

---

## 4. Connections

| Logical operation | Exposure |
|-------------------|----------|
| **POST /connections**, **GET /connections**, **GET /connections/:id**, **PATCH**, **DELETE** | GraphQL mutations/queries on `connections` (insert, query list, `connections_by_pk`, update, delete). RLS filters by tenant. |
| **POST /connections/:id/test** | **`testConnection`** (GraphQL mutation, Hasura Action → Node). Input: `{ connectionId }`. Decrypts secrets, performs test call, returns `{ success, error?, diagnostics? }`. |

**Checklist:** Connections CRUD + test are specified (GraphQL + `testConnection` Action).

---

## 5. Workflows

### 5.1 Workflow CRUD

| Logical operation | Exposure |
|-------------------|----------|
| Create / List / Get / Update / Delete workflows | GraphQL mutations/queries on `workflows` and `workflow_versions` (e.g. `workflows`, `workflows_by_pk`, `insert_workflows_one`, `update_workflows_by_pk`, `delete_workflows_by_pk`). |

### 5.2 Version Publish

- **`publishWorkflowVersion`** (GraphQL mutation, Hasura Action → Node)  
  Input: `{ workflowId, workflowVersionId? }`. Sets version as latest and `publishedAt`. Returns published version.

**Checklist:** Workflow CRUD and version publish are specified (GraphQL + `publishWorkflowVersion` Action).

### 5.3 Trigger CRUD

| Logical operation | Exposure |
|-------------------|----------|
| Create / List / Get / Update / Delete triggers | GraphQL mutations/queries on `triggers` (`triggers`, `triggers_by_pk`, insert, update, delete). |

### 5.4 Run Workflow (Manual)

- **`runWorkflow`** (GraphQL mutation, Hasura Action → Node)  
  Input: `{ workflowId, workflowVersionId?, input?, idempotencyKey? }`. Creates `WorkflowRun`, enqueues job for runner, returns `{ workflowRunId, status }`.

**Checklist:** Trigger CRUD and `POST /workflows/:id/run` are specified (GraphQL + `runWorkflow` Action).

---

## 6. Runs and Logs

### 6.1 List and Get Runs

| Logical operation | Exposure |
|-------------------|----------|
| **GET /runs** | GraphQL query `workflow_runs` (with optional filters: workflowId, status, limit, offset). RLS by tenant. |
| **GET /runs/:id** | GraphQL query `workflow_runs_by_pk(id: $id)`. |

### 6.2 Get Steps for a Run

| Logical operation | Exposure |
|-------------------|----------|
| **GET /runs/:id/steps** | GraphQL query `step_runs` filtered by `workflow_run_id: $id`, or via relation `workflow_runs_by_pk(id: $id) { step_runs { ... } }`. |

### 6.3 Get Logs (MongoDB)

- **`getRunLogs`** (GraphQL query Action, Hasura Action → Node)  
  Input: `{ workflowRunId }`. Returns logs from MongoDB for that run (tenant-scoped).  
  **GET /runs/:id/logs** is represented by this Action.

### 6.4 Cancel Run

- **`cancelRun`** (GraphQL mutation, Hasura Action → Node)  
  Input: `{ workflowRunId }`. Marks run as canceled, signals runner to stop. Returns updated run.

**Checklist:** `POST /runs/:id/cancel` is specified as the `cancelRun` Action.

### 6.5 Re-run with Prior Input

- **`rerunWorkflow`** (GraphQL mutation, Hasura Action → Node)  
  Input: `{ workflowRunId }`. Creates a new `WorkflowRun` with the same `input` (and optionally same workflow version) as the given run. Enqueues and returns `{ workflowRunId, status }`.

**Checklist:** Re-run endpoint is specified as the `rerunWorkflow` Action.

---

## 7. Webhook Trigger Intake (HTTP)

For triggers with `type: WEBHOOK`, the Node service exposes:

- **`POST /webhooks/:path`** (or a single base path plus routing, e.g. `POST /webhooks/invoke` with body or header identifying the trigger).  
  Implementation: resolve trigger by path (or by trigger id in header/body); verify HMAC using `webhookSecretCipher`; create `WorkflowRun` with payload as input; enqueue run.

Exact path design (e.g. `/webhooks/<tenantId>/<triggerKey>` or hashed path) is an implementation detail; the API surface is “HTTP POST to a webhook URL per trigger, with optional signature verification.”

---

## 8. Summary: Checklist 7 Compliance

| Checklist item | Specification |
|----------------|---------------|
| Login / logout / session refresh | REST: POST /api/auth/register, POST /api/auth/login; refresh optional; logout client-side. |
| Tenant switch / select | GET /api/tenants; tenant in JWT (login or switch-tenant). |
| User invites and role updates | Actions: inviteUserToTenant, acceptInvitation; role via update_memberships_by_pk. |
| Apps CRUD | GraphQL: apps, apps_by_pk, insert/update/delete. |
| Actions CRUD | GraphQL: actions, actions_by_pk, insert/update/delete (keyed by appVersionId). |
| POST /actions/:id/test | Action: testAction(actionId, …). |
| POST /apps/:id/publish | Action: publishAppVersion(appId, …). |
| Connections CRUD + test | GraphQL CRUD on connections; Action testConnection(connectionId). |
| Workflow CRUD | GraphQL on workflows / workflow_versions. |
| Version publish | Action: publishWorkflowVersion(workflowId, …). |
| Trigger CRUD | GraphQL on triggers. |
| POST /workflows/:id/run | Action: runWorkflow(workflowId, …). |
| GET /runs, GET /runs/:id | GraphQL: workflow_runs, workflow_runs_by_pk. |
| GET /runs/:id/steps | GraphQL: step_runs or relation from workflow_runs_by_pk. |
| GET /runs/:id/logs | Action: getRunLogs(workflowRunId). |
| POST /runs/:id/cancel | Action: cancelRun(workflowRunId). |
| Re-run with prior input | Action: rerunWorkflow(workflowRunId). |

This completes **7) API Surface Checklist**.
