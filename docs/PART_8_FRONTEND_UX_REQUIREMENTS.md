# Part 8 – Frontend UX Requirements Specification

This document specifies the **frontend UX requirements** (section 8 of the main checklist) for the SaaS Integration Platform. It defines the user-facing flows, key screens, and behaviors that the web app (Nuxt 3 + Vuetify) must provide. API usage is aligned with [PART_7_API_SURFACE.md](./PART_7_API_SURFACE.md).

**Reference:** [PART_1_PRODUCT_SCOPE_AND_SUCCESS_CRITERIA.md](./PART_1_PRODUCT_SCOPE_AND_SUCCESS_CRITERIA.md) (outcomes); existing pages under `web/pages/`: login, index, apps, actions, connections, workflows, triggers, runs, settings.

---

## 1. Authentication and Tenant-Aware Navigation

### 1.1 Requirements

- **Login:** User can sign in with email, password, and tenant selection. Unauthenticated users are redirected to login; after success, they land on the app with the selected tenant context.
- **Registration (optional for MVP):** User can register a new tenant (organization) and become Owner, via a dedicated register flow (e.g. `/register`) calling `POST /api/auth/register`.
- **Tenant-aware navigation:** All app routes operate in the context of a single selected tenant. The tenant is either fixed from login (JWT contains `x-hasura-tenant-id`) or switchable via a tenant switcher that re-authenticates or calls a switch-tenant endpoint to obtain a new JWT.
- **Navigation structure:** A persistent layout (e.g. sidebar or app bar) shows:
  - Links: Dashboard (index), Apps, Actions, Connections, Workflows, Triggers, Runs, Settings.
  - Current tenant name and/or tenant switcher (dropdown or modal listing tenants from `GET /api/tenants`).
  - User menu: profile, logout (discard token and redirect to login).
- **Authorization:** UI hides or disables actions that the user’s role cannot perform (e.g. Viewer cannot edit workflows; only Owner/Admin see Settings or invite). Role is available from JWT or from a “me”/membership query.

### 1.2 API Mapping

- Login: `POST /api/auth/login` (email, password, tenantId).
- Register: `POST /api/auth/register` (email, password, tenantName, tenantSlug, name?).
- Tenant list: `GET /api/tenants`.
- All GraphQL requests use the JWT (with `x-hasura-tenant-id`, `x-hasura-role`) so Hasura enforces tenant and role.

### 1.3 Acceptance Criteria

- Unauthenticated access to any protected route redirects to login.
- After login, user sees the main layout with sidebar/nav and tenant context.
- User can switch tenant (via switcher + re-login or switch-tenant) and see only data for the selected tenant.
- Logout clears token and redirects to login.

---

## 2. App and Action Builders with Schema Editors

### 2.1 Requirements

- **Apps list:** A screen (e.g. `/apps`) that lists all Apps for the current tenant. Each row shows: name, key/slug, vendor, auth type, status (draft/published), last updated. Actions: Create App, Edit, Delete, “Publish” (when applicable). List is loadable via GraphQL query `apps` (or equivalent).
- **App create/edit:** A form to create or edit an App: name, key (slug), vendor, description, auth type (e.g. API Key, OAuth2). Create uses GraphQL `insert_apps_one`; update uses `update_apps_by_pk`. Validation: key unique per tenant, required fields.
- **App versions:** When editing an App, the user works with a “version” (draft or latest). Publishing is a separate action that calls the `publishAppVersion` Action.
- **Actions per App (or App Version):** From an App detail page, user can list and manage Actions. Each Action has: key, name, endpoint URL, HTTP method, input schema (JSON Schema), output schema (optional), timeout/retry settings. List via GraphQL `actions` (filter by `appVersionId` or via relation from app).
- **Action create/edit:** Form fields for key, name, endpoint, method, and **schema editors** for input/output:
  - **Schema editor:** A dedicated UI (e.g. JSON editor or structured form) to edit JSON Schema for the action’s input and optionally output. Accepts raw JSON or a simplified key-type mapping. Validation: valid JSON Schema so the runner can validate payloads.
- **Action test:** From the Action detail or list, a “Test” button that opens a modal or panel: user selects Connection (if required), optionally provides sample input JSON; on submit, call `testAction` Action and show result (success/failure, output or error message).

### 2.2 API Mapping

- Apps CRUD: GraphQL `apps`, `apps_by_pk`, `insert_apps_one`, `update_apps_by_pk`, `delete_apps_by_pk`.
- Actions CRUD: GraphQL `actions`, `actions_by_pk`, `insert_actions_one`, `update_actions_by_pk`, `delete_actions_by_pk` (with `appVersionId`).
- Test: `testAction` Action (actionId, connectionId?, input?).
- Publish app: `publishAppVersion` Action (appId, appVersionId?).

### 2.3 Acceptance Criteria

- User can create, list, edit, and delete Apps with validation and tenant isolation.
- User can add/edit/delete Actions under an App (version), with input/output schema editable (JSON Schema).
- User can run a test for an Action with chosen Connection and optional input and see the result.

---

## 3. Connection Secrets Form with Masking and Test Button

### 3.1 Requirements

- **Connections list:** Screen (e.g. `/connections`) listing Connections for the tenant. Columns: App name, connection name/label, status (active/inactive), last tested (optional). Actions: Create Connection, Edit, Delete, Test.
- **Connection create/edit:** Form scoped to an App (and optionally App Version). Fields: name/label, and **credentials** depending on the App’s auth type:
  - For API Key: field(s) for key (and optionally secret). Values must be entered in plaintext for saving but must **never** be shown in full after save—only masked (e.g. `••••••••`) or “Not set / Update”.
  - For OAuth2: client id, client secret (masked when stored), redirect URL; or “Connect” flow that stores tokens after OAuth callback.
- **Masking:** Any secret or credential field that is stored must be displayed as masked (e.g. dots or placeholder). Provide “Change” or “Update” to enter new value without pre-filling the old one.
- **Test button:** On the connection form or row, a “Test” button that calls `testConnection` Action with the connection id. Show loading state, then success (e.g. “Connection OK”) or error with message/diagnostics. Do not send or display raw secrets in the UI beyond the input field during edit.

### 3.2 API Mapping

- Connections CRUD: GraphQL on `connections`.
- Test: `testConnection` Action (connectionId). Backend decrypts secrets and performs test; frontend only sends id.

### 3.3 Acceptance Criteria

- User can create and edit Connections with credential fields appropriate to the App’s auth type.
- Stored secrets are never shown in plaintext; they are masked or “Update” only.
- “Test connection” runs the Action and shows clear success or error feedback.

---

## 4. Workflow Canvas UI (Drag/Drop Nodes)

### 4.1 Requirements

- **Workflows list:** Screen (e.g. `/workflows`) listing Workflows for the tenant. Columns: name, key, status, last run (optional). Actions: Create Workflow, Edit, Delete, Run (manual trigger).
- **Workflow editor (canvas):** A workflow is represented as a **graph of nodes**:
  - **Trigger node:** Single entry point (manual, webhook, or cron). One per workflow; type and config (e.g. cron expression, webhook path) are editable in the node or a side panel.
  - **Step nodes:** Each step is an Action (with optional Connection override) and input mapping. Steps are arranged in a linear sequence for MVP (branching/conditionals post-MVP). Nodes can be **dragged and dropped** to reorder; edges connect trigger → step1 → step2 → …
- **Canvas behavior:** Drag-and-drop to add steps (from a palette of available Actions or from “Add step”), reorder by dragging, delete step, connect trigger to first step and step-to-step. The underlying model is a linear list of steps (e.g. `steps: [{ actionId, connectionId?, inputMapping }]`) stored in `WorkflowVersion.graph` or equivalent.
- **Save and version:** Saving creates or updates a draft version; “Publish” calls `publishWorkflowVersion` so the workflow is runnable with that version.

### 4.2 API Mapping

- Workflows CRUD: GraphQL on `workflows`, `workflow_versions`.
- Trigger CRUD: GraphQL on `triggers`.
- Publish: `publishWorkflowVersion` Action.
- Manual run: `runWorkflow` Action (workflowId, input?, idempotencyKey?).

### 4.3 Acceptance Criteria

- User can create/edit a workflow on a canvas with a trigger node and ordered step nodes.
- User can add, remove, and reorder steps via drag-and-drop (or equivalent reorder controls).
- Workflow and version are persisted via GraphQL; user can publish and run manually.

---

## 5. Trigger Configuration UI (Manual / Webhook / Cron)

### 5.1 Requirements

- **Trigger representation:** Each workflow has one or more triggers (manual is implicit; webhook and cron are configurable). A dedicated Triggers screen (e.g. `/triggers`) or a section inside the workflow editor lists triggers for the tenant (or for the current workflow).
- **Manual trigger:** No config; “Run” button on workflow detail or list that calls `runWorkflow` with optional input. UI: button + optional JSON input modal.
- **Webhook trigger:** User can create a trigger with type “Webhook”. Config: optional path/slug (or system-generated), and **webhook URL** displayed for copying. Secret for signing shown once (or “Regenerate”) so user can configure the external system. UI shows: “POST &lt;baseUrl&gt;/webhooks/…”, copy button, and secret management (masked).
- **Cron trigger:** User can create a trigger with type “Cron”. Config: cron expression (with helper or preset: every 5 min, hourly, daily, custom). Schedule is sent to backend and stored; scheduler (in Node or worker) runs the workflow at the given times.

### 5.2 API Mapping

- Trigger CRUD: GraphQL on `triggers` (create, update, delete; link to workflowId).
- Run workflow: `runWorkflow` Action.
- Webhook URL is derived from app config and trigger path (Part 7 webhook intake).

### 5.3 Acceptance Criteria

- User can configure manual run (button), webhook (URL + secret), and cron (expression) for a workflow.
- Webhook URL and secret are clearly displayed (secret masked after first show or regenerated).
- Cron expression is validated and saved; user understands when the workflow will run.

---

## 6. Run Monitor with Live Updates and Step Logs

### 6.1 Requirements

- **Runs list:** Screen (e.g. `/runs`) listing WorkflowRuns for the tenant. Columns: run id (short), workflow name, trigger type, status (pending/running/success/failed/canceled), started at, duration. Filters: by workflow, by status, date range. Pagination (limit/offset). Data from GraphQL `workflow_runs` (and relations).
- **Run detail:** Clicking a run opens a run detail view:
  - **Header:** Run id, workflow name, status, started/finished time, duration. Actions: Cancel (if running), Re-run (create new run with same input).
  - **Steps:** List or diagram of steps with per-step status (pending/running/success/failed), duration, and expandable **step logs**. Step list from GraphQL (e.g. `step_runs` for that `workflowRunId`).
  - **Logs:** For the run and for each step, show **execution logs**. Logs come from `getRunLogs` Action (MongoDB). Display as a stream or list (timestamp, level, message, optional context). **Live updates:** Polling or subscription (e.g. poll every 2–5 s while status is “running”) so that new steps and log lines appear without refresh.
- **Re-run:** Button “Re-run” calls `rerunWorkflow` Action with the current run id; redirect or link to the new run detail.

### 6.2 API Mapping

- List runs: GraphQL `workflow_runs` (with filters).
- Run by id: GraphQL `workflow_runs_by_pk(id)` with `step_runs`.
- Logs: `getRunLogs` Action (workflowRunId).
- Cancel: `cancelRun` Action (workflowRunId).
- Re-run: `rerunWorkflow` Action (workflowRunId).

### 6.3 Acceptance Criteria

- User can see a paginated, filterable list of runs and open a run detail.
- Run detail shows step status and step-level logs; logs load via getRunLogs.
- While a run is “running”, the UI updates (polling or subscription) to show progress and new logs.
- User can cancel a running run and re-run from a completed run.

---

## 7. Error Surfaces with Actionable Diagnostics

### 7.1 Requirements

- **Form validation:** Inline errors on forms (required fields, format, uniqueness). Show field-level messages and optionally a summary at top.
- **API/GraphQL errors:** When a mutation or query fails, show a clear message: e.g. “Connection test failed: Invalid credentials” or “Workflow run failed: Step 2 timeout”. Prefer server-provided message/code; fallback to generic “Something went wrong”. Do not expose stack traces or internal IDs in production.
- **Run/step failure:** In the run monitor, failed steps must be clearly indicated (e.g. red icon, “Failed” badge). Expand the step to show error message and relevant logs. If the backend returns error code or step output, display it so the user can fix the connection, input, or workflow.
- **Actionable diagnostics:** Where possible, link or suggest next steps: e.g. “Test connection” for a connection error, “Edit step” for a step failure, “View logs” for run failures. Optional: short guidance text per error code (e.g. “TIMEOUT: Increase step timeout or check external service”).

### 7.2 Acceptance Criteria

- Validation errors are shown inline; API errors are shown in a consistent, user-friendly way.
- Failed runs/steps show clear error state and logs; user can identify cause and take action (test connection, edit workflow, re-run).

---

## 8. Search/Filter Across Apps, Actions, Workflows, Runs

### 8.1 Requirements

- **Apps:** List supports search by name or key; optional filter by vendor or status. Implement via GraphQL query variables (e.g. `where: { _or: [{ name: { _ilike: "%" + q + "%" } }, { key: { _ilike: "%" + q + "%" } }] }`).
- **Actions:** On the Actions list (or under an App), filter by app or search by action name/key. GraphQL `actions` with `where` on name/key and relation to app.
- **Workflows:** List supports search by name or key; filter by status. GraphQL `workflows` with `where`.
- **Runs:** List supports filters: workflow (dropdown), status (dropdown), date range (from/to). Optional free-text search on run id. GraphQL `workflow_runs` with `where` (workflowId, status, createdAt).
- **Connections:** Optional filter by App. GraphQL `connections` with `where.appId`.
- **Triggers:** Filter by workflow or trigger type. GraphQL `triggers` with `where`.

### 8.2 API Mapping

- All list endpoints support `where` and optional `limit`/`offset`; frontend passes search and filter criteria as query variables.

### 8.3 Acceptance Criteria

- User can search and/or filter lists for Apps, Actions, Workflows, Runs (and optionally Connections, Triggers) so that large datasets are manageable.

---

## 9. Summary: Checklist 8 Compliance

| Checklist item | Specification |
|----------------|----------------|
| Authentication and tenant-aware navigation | Login/register, tenant list and switch, protected routes, nav with tenant + user menu, role-based visibility. |
| App/action builders with schema editors | Apps list and CRUD; Actions list and CRUD with JSON Schema editors for input/output; test action. |
| Connection secrets form with masking and test button | Connection form with credential fields per auth type; masking for stored secrets; Test button calling testConnection. |
| Workflow canvas UI (drag/drop nodes) | Canvas with trigger node and step nodes; drag-and-drop reorder; save/version and publish. |
| Trigger configuration UI (manual/webhook/cron) | Manual run button; webhook URL + secret config; cron expression config. |
| Run monitor with live updates and step logs | Runs list with filters; run detail with steps and logs; live updates (polling); cancel and re-run. |
| Error surfaces with actionable diagnostics | Form validation, API error display, run/step failure display with logs and suggested actions. |
| Search/filter across apps/actions/workflows/runs | Search and filter on list pages using GraphQL `where` and query variables. |

This completes **8) Frontend UX Requirements Checklist**.
