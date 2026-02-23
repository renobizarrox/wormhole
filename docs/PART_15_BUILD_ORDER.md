# Part 15 – Build Order (Practical Execution Checklist)

This document defines the **build order** (section 15 of the main checklist): the practical sequence of implementation phases and tasks from foundation through hardening. Each phase builds on the previous; checkboxes in the main checklist reflect completion status. References: [PART_6_DATA_MODEL_SPECIFICATION.md](./PART_6_DATA_MODEL_SPECIFICATION.md), [PART_7_API_SURFACE.md](./PART_7_API_SURFACE.md), [PART_8_FRONTEND_UX_REQUIREMENTS.md](./PART_8_FRONTEND_UX_REQUIREMENTS.md), [PART_9_DEVOPS_ENVIRONMENTS_AND_DELIVERY.md](./PART_9_DEVOPS_ENVIRONMENTS_AND_DELIVERY.md), [PART_10_TESTING_STRATEGY.md](./PART_10_TESTING_STRATEGY.md).

---

## 1. Foundation

**Status:** Complete (repo, auth, core entities and migrations are in place.)

- **Repo structure and coding standards.** Monorepo with `api/`, `web/`, `runner/`, `docs/`; shared conventions (lint, format, TypeScript/Python config). See checklist and CONVENTIONS/CONTRIBUTING.
- **Auth, tenants, RBAC.** Node API: register, login, JWT with Hasura claims; tenant list; role in JWT; middleware for protected routes and role checks. Hasura configured for session variables (tenant, user, role).
- **Core entities and DB migrations.** Prisma schema: Tenant, User, Membership, Invitation, AuditEvent, App, AppVersion, Action, Connection, Workflow, WorkflowVersion, Trigger, WorkflowRun, StepRun. Migrations applied; Hasura tracks same tables.

**Next:** Expose App/Action/Connection CRUD via Hasura (and custom Actions where needed) and implement Connector Core.

---

## 2. Connector Core

**Goal:** Users can define Apps and Actions, create Connections with encrypted credentials, and test an Action manually.

| Task | Description | References |
|------|-------------|------------|
| **App/action schemas and CRUD** | Expose GraphQL CRUD for `apps`, `app_versions`, `actions` with Hasura permissions (tenant-scoped). Ensure AppVersion creation and Action create/update/delete with valid bodySchema/querySchema/pathSchema (JSON Schema). Implement validation hooks on save (Part 12). | Part 6 (data model), Part 7 (§3 Apps and Actions) |
| **Connection management and secret vaulting** | Expose GraphQL CRUD for `connections`. Implement encrypt/decrypt for Connection credentials using KMS or Vault (Part 11). Never return plaintext secrets; mask in API responses. Support credential schema per AppVersion auth type. | Part 6, Part 7 (§4 Connections), Part 11 |
| **Manual action testing endpoint** | Implement `testAction` Hasura Action (Node handler): given actionId, optional connectionId and input, resolve connection, build request from Action definition, call external API (or runner stub), return success/output or error/diagnostics. Implement `testConnection` Action: decrypt credentials, perform minimal auth request, return result. | Part 7 (§3.3, §4), Part 12 (test hooks) |

**Dependencies:** Foundation (auth, DB, Hasura). Optional: runner can be stubbed (Node calls external API directly for test) until Phase 4.

**Done when:** Apps and Actions can be created/edited via API; Connections can be created with encrypted secrets; test connection and test action both work.

---

## 3. Workflow Core

**Goal:** Workflows and versions can be created; triggers (manual, webhook, cron) create runs; run state and logs are persisted.

| Task | Description | References |
|------|-------------|------------|
| **Workflow schema + versioning** | Expose GraphQL CRUD for `workflows` and `workflow_versions`. Store workflow graph (linear steps: trigger → step1 → step2…) in version payload. Implement `publishWorkflowVersion` Action. | Part 6, Part 7 (§5) |
| **Trigger handlers (manual/webhook/cron)** | **Manual:** `runWorkflow` Action: create WorkflowRun, enqueue job for runner (or stub). **Webhook:** Node HTTP route(s) for webhook paths; resolve Trigger by path, verify HMAC, create WorkflowRun with payload, enqueue. **Cron:** Scheduler (Node or worker) that evaluates cron triggers and creates WorkflowRuns; enqueue. | Part 7 (§5.4, §7 webhooks), Part 11 (signed webhooks) |
| **Run state machine + logs** | On run start/step start/step end/run end: update WorkflowRun and StepRun status in PostgreSQL. Write execution logs to MongoDB (runner or Node). Expose `getRunLogs` Action (and GraphQL for runs/steps). Implement `cancelRun` and `rerunWorkflow` Actions. | Part 6 (WorkflowRun, StepRun, ExecutionLog), Part 7 (§6), ARCHITECTURE_STORAGE |

**Dependencies:** Connector Core (Actions and Connections exist). Queue (Redis/BullMQ) for enqueue; runner can be stub that only updates DB and writes logs until Phase 4.

**Done when:** User can create a workflow with trigger and steps; manual run and webhook/cron create WorkflowRuns; run and step status and logs are queryable.

---

## 4. Isolated Execution

**Goal:** Each workflow run executes in an isolated container; the Python runner consumes jobs, runs steps, and reports state and logs.

| Task | Description | References |
|------|-------------|------------|
| **Python runner implementation** | Runner process: poll or consume queue for workflow run jobs; load workflow version and connection credentials; for each step, build HTTP request from Action definition, execute (with timeout/retry), parse response; update StepRun and write logs to MongoDB; on run complete, update WorkflowRun. | Part 2.3 (Actions), Part 5 (container per run), Part 10 (unit tests) |
| **Queue integration and orchestrator** | Node (or separate service) enqueues jobs to Redis/BullMQ with run id and tenant context. Runner workers consume jobs; optionally Node receives callbacks or polls for status. Ensure at-least-once processing and idempotency (Part 6 idempotencyKey). | Part 4.4 (messaging), Part 9 |
| **Containerized run lifecycle in Kubernetes Jobs** | Runner starts each run in a container (Kubernetes Job or Docker). Job receives run id, workflow payload, and temporary injected secrets; executes steps; reports back and exits. Resource limits, TTL, and cleanup per Part 5. Alternative for MVP: runner process runs steps in-process with timeout; add container isolation in Phase 2. | Part 5 (WORKFLOW_ISOLATION_CONTAINER_PER_RUN), Part 9 |

**Dependencies:** Workflow Core (run creation and state machine). Queue and MongoDB for logs.

**Done when:** Enqueued runs are picked up by the runner; steps execute in isolation (or in-process with clear path to containers); logs and state are correct.

**Implementation notes (MVP):**

- **Queue integration (Node):** When `REDIS_URL` is set, the Node API enqueues workflow run jobs (BullMQ `workflow-runs` queue) from `POST /workflows/:id/run`, `POST /runs/:id/rerun`, webhook handler, and cron scheduler. A BullMQ worker in the same process consumes jobs and calls `executeWorkflowRun(workflowRunId)`. Without Redis, runs execute in-process (dev mode).
- **Python runner (follow-up):** The Python runner can later consume the same Redis queue (e.g. BullMQ-compatible or a Redis list) and execute runs (by calling a Node “execute run” endpoint or reimplementing execution). For MVP, the Node worker is the only consumer.
- **Containerized run lifecycle:** The runner can run inside Docker or Kubernetes (e.g. as a Deployment that runs the Node worker or the Python worker). Optional: one container per run via a Kubernetes Job that receives a single job, executes the workflow, reports state, and exits; use resource limits, TTLAfterFinished, and temporary secret injection per Part 5.

---

## 5. Frontend UX

**Goal:** Full UI for apps, actions, connections, workflows, triggers, and runs per Part 8.

| Task | Description | References |
|------|-------------|------------|
| **App/action management pages** | List/create/edit/delete Apps; list/create/edit/delete Actions per App with schema editors (JSON Schema for body/query/path). Test action button (testAction). Publish app (publishAppVersion). Search/filter. | Part 7, Part 8 (§2) |
| **Workflow builder and run monitor** | Workflow list and editor with canvas: trigger node + step nodes; drag-and-drop reorder; save/version and publish. Trigger config: manual, webhook (URL + secret), cron. Run list with filters; run detail with steps and logs; live updates (polling); cancel and re-run. | Part 7 (§5, §6), Part 8 (§4, §5, §6) |
| **Error diagnostics and audit views** | Inline validation and API error display; run/step failure view with logs and suggested actions. Optional: audit event list (filter by tenant, user, resource). Search/filter across apps, actions, workflows, runs. | Part 8 (§7, §8) |

**Dependencies:** Connector Core and Workflow Core APIs (GraphQL + Actions). Auth and tenant-aware nav (Part 8 §1) should already be in place from Foundation.

**Done when:** Users can perform all MVP flows from the UI: create app → action → connection → workflow → run and monitor results.

**Implementation notes (MVP):**

- **API:** Web app uses the Node REST API (not Hasura GraphQL) via composable `useApi()` with Bearer token from cookie; all list/create/update/delete and actions (test, publish, run, cancel, rerun) go through `/api/*`.
- **Apps:** List, create, edit, delete, publish; app detail at `/apps/[id]` with actions list, add/edit/delete action, JSON schema editors (body/query/path), test action with optional connection and input.
- **Connections:** List, create, edit (credentials optional on edit for masking), delete, test; credentials as JSON, never shown after save.
- **Workflows:** List, create, edit, delete; workflow editor at `/workflows/[id]` with steps (add/remove/reorder, action + optional connection), save as new version, publish, triggers (manual/webhook/cron) with webhook URL display, Run button.
- **Runs:** List with workflow and status filters; run detail at `/runs/[id]` with steps, logs, polling while QUEUED/RUNNING, cancel and re-run.
- **Errors:** Inline validation on forms; API errors shown via `isApiError()` and alert/snackbar; run/step failures shown in run detail with status and error message.

---

## 6. Hardening

**Goal:** Production-ready reliability, security, and operations.

| Task | Description | References |
|------|-------------|------------|
| **Performance tests and scale tuning** | Load tests (Part 10): API and queue saturation; measure throughput and latency. Tune DB indexes, connection pools, queue workers. Apply quotas (Part 13) and autoscaling (Part 9). | Part 10, Part 13, Part 9 |
| **Security controls and scanning** | KMS/Vault for secrets; zero plaintext in logs; webhook signature and replay protection (Part 11). SAST, container and dependency scanning in CI (Part 9). Authz and tenant isolation tests (Part 10). | Part 11, Part 9, Part 10 |
| **Observability and on-call readiness** | Dashboards (API, queue, runner, DB); alerts (failures, saturation, latency); centralized logs and retention; incident runbooks (Part 9). Pen-test readiness checklist (Part 11). | Part 9, Part 11 |

**Dependencies:** Phases 1–5 implemented. Staging or production-like environment.

**Done when:** SLOs are measurable and alerted; security baseline is met; runbooks exist and team can respond to incidents.

**Implementation notes (MVP):**

- **Performance tests and scale tuning:** k6 script `scripts/load/health.js` for health endpoint load test (run before releases; document baseline). Tune DB indexes per schema; connection pool and queue workers as needed (Part 10, Part 13).
- **Security controls and scanning:** CI (`.github/workflows/ci.yml`) runs lint, typecheck, unit tests, and `npm audit --audit-level=high` (report only). Authz tests in `api/src/routes/authz.test.ts`: unauthenticated → 401, Viewer on write route → 403, Viewer on read route → 200. Secrets: encryption for connection/trigger secrets; no plaintext in API responses or logs. Webhook signature verification in place. SAST/container scanning can be added to CI (Part 9).
- **Observability and on-call readiness:** Health endpoint `GET /health` for liveness/readiness. `docs/OBSERVABILITY.md` summarizes metrics, alerts, and load test; `docs/runbooks/high-error-rate-or-queue-backup.md` for incident response. Dashboards and centralized logs per Part 9 (Coolify or Prometheus/Grafana).

---

## 7. Execution Order Summary

1. **Foundation** (done) → **Connector Core** → **Workflow Core** (can overlap with Connector Core once CRUD exists).
2. **Isolated Execution** after Workflow Core (run creation and state machine in place).
3. **Frontend UX** in parallel with Connector Core and Workflow Core (APIs first; UI consumes them).
4. **Hardening** after end-to-end flow works (Phase 1–4 + 5).

Use the main checklist section 15 to tick off each item as it is completed.
