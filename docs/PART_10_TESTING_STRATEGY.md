# Part 10 – Testing Strategy

This document specifies the **testing strategy** (section 10 of the main checklist) for the SaaS Integration Platform. It defines unit, integration, end-to-end, and non-functional testing scope, tools, and acceptance criteria. Implementation aligns with [PART_7_API_SURFACE.md](./PART_7_API_SURFACE.md) and the data model in [PART_6_DATA_MODEL_SPECIFICATION.md](./PART_6_DATA_MODEL_SPECIFICATION.md).

---

## 1. Unit Tests

### 1.1 Node API Business Rules

- **Scope:** Pure business logic in the Node API that does not depend on live DB or external services. Test in isolation with mocks or in-memory doubles.
- **Examples:**
  - **Auth:** Validation of login/register payloads (Zod schemas); JWT payload construction (claims, expiry); password hashing verification (bcrypt); rejection of invalid tenant or duplicate email/slug.
  - **RBAC:** Role checks (e.g. `requireRole` middleware behavior with different roles); tenant extraction from JWT.
  - **Invites:** Token generation and expiry logic; validation of invite payloads.
  - **Helpers:** Any pure functions for input mapping, webhook signature computation, or idempotency key derivation.
- **Tools:** **Vitest** (already in `api/package.json`). Use `vi.mock()` for Prisma or external deps when testing handlers.
- **Location:** `api/src/**/*.test.ts` or `api/test/unit/**`.
- **CI:** `cd api && pnpm test` (Vitest run).

### 1.2 Python Action Execution Engine

- **Scope:** Core execution logic in the Python runner that can be tested without a full container or live queue. Focus on single-step execution, schema validation, request building, and response parsing.
- **Examples:**
  - **Schema validation:** JSON Schema validation of action input against a fixture schema; invalid payloads rejected with clear errors.
  - **Request building:** HTTP request construction from action definition (URL, method, headers, body) and connection credentials (mocked or fixture).
  - **Response handling:** Parsing of success/error responses; timeout and retry logic (unit-level: e.g. “after N failures, raise”).
  - **Mapping logic:** Input/output mapping (e.g. expression evaluation or template substitution) if implemented in runner.
- **Tools:** **pytest** (already in `runner/pyproject.toml`). Use fixtures for action/connection payloads; mock `requests` or HTTP client.
- **Location:** `runner/tests/` (e.g. `test_execution.py`, `test_schema_validation.py`).
- **CI:** `cd runner && uv run pytest`.

### 1.3 Schema Validation and Mapping Logic

- **Scope:** Any shared or service-specific logic that validates or transforms data against JSON Schema or internal schemas.
- **Node:** Zod schemas for API input: unit tests that assert valid payloads pass and invalid ones fail with expected errors. Custom validators (e.g. for GraphQL Action inputs) tested in isolation.
- **Python:** JSON Schema validation (e.g. `jsonschema` library) for action inputs: tests with valid/invalid JSON and schema fixtures. Mapping logic (e.g. input → request body) with known inputs and expected outputs.
- **Shared:** If connector or action definitions are validated by a shared schema (e.g. YAML/JSON for app definitions), add unit tests that valid definitions pass and invalid ones fail.

---

## 2. Integration Tests

### 2.1 API + DB + Queue Behavior

- **Scope:** Node API (and optionally Hasura) with a real PostgreSQL and Redis instance. No mock DB; use a test database (e.g. separate DB or Docker Compose with a `wormhole_test` DB). Tests may enqueue jobs to Redis/BullMQ and assert they appear (or process them with a test worker).
- **Examples:**
  - **Auth flow:** Register → DB has Tenant, User, Membership; Login with correct credentials returns JWT; wrong password or wrong tenant fails.
  - **CRUD:** Create app via API (or GraphQL), read back from DB; update and delete; ensure tenant_id is set and RLS would enforce isolation.
  - **Queue:** Trigger a workflow run (e.g. `runWorkflow` Action or equivalent); assert WorkflowRun row created and a job enqueued in Redis (or job payload matches expected shape).
- **Tools:** Vitest (or Jest) with `test` environment; start API with `buildApp()`, connect to test DB and test Redis. Use Prisma migrations to set up schema; truncate or use transactions for isolation between tests.
- **Setup:** Docker Compose for Postgres + Redis (or CI services); `DATABASE_URL` and `REDIS_URL` point to test instances.
- **CI:** `cd api && pnpm test:integration` (or include in `pnpm test` with env flag).

### 2.2 Trigger to Run Lifecycle

- **Scope:** From trigger event to run creation and (optionally) job consumption. Prove that manual trigger, webhook, or cron path creates a WorkflowRun and enqueues the job.
- **Examples:**
  - **Manual:** Call `runWorkflow` (or POST equivalent) with workflowId; assert one WorkflowRun row in DB with status pending/queued and one job in queue.
  - **Webhook:** POST to webhook URL with valid signature; assert WorkflowRun created with webhook payload as input and job enqueued. POST with invalid signature returns 401/403 and no run.
  - **Cron:** Simulate cron tick (e.g. call internal scheduler endpoint or trigger with test clock); assert runs created for due triggers and enqueued.
- **Tools:** Integration test suite in Node (Vitest) with real DB + Redis; optional short-lived worker to process one job and assert StepRun/WorkflowRun updates if needed.

### 2.3 Credential Retrieval and Secret Masking

- **Scope:** Backend behavior only: connection credentials are retrieved and decrypted for execution; they are never returned in API responses in plaintext. Logs never contain plaintext secrets.
- **Examples:**
  - **Retrieval:** In a test with a Connection row containing encrypted secret (e.g. test key encrypted with a test KMS/encryption), call code path that “resolves” connection for run; assert decrypted value is used for HTTP call and not logged.
  - **Masking:** API that returns connection list or connection by ID must not include `secretCipher` raw or decrypted; test that response fields are masked or omitted.
  - **Test connection:** `testConnection` Action: with valid encrypted credentials, assert success; with invalid, assert failure; assert no secret in response body or logs.

---

## 3. End-to-End Tests

### 3.1 User Creates App → Action → Connection → Workflow → Run

- **Scope:** Full flow through UI or through API/GraphQL as a user would: create tenant/user (or use fixture), create app, add action, create connection, create workflow with trigger and steps, trigger run, then verify run and step status (and optionally logs).
- **Implementation options:**
  - **API/GraphQL E2E:** Script (e.g. Vitest or Playwright) that calls REST and GraphQL in sequence with a test user JWT; no browser. Fast, good for CI.
  - **Browser E2E:** Playwright (or Cypress) drives the real UI: login, create app, add action, create connection, create workflow, run, open run detail. Slower but validates full UX.
- **Acceptance:** At least one path that creates app → action → connection → workflow → run and asserts run exists and reaches a terminal state (success or expected failure). Prefer API-level E2E for MVP; add browser E2E for critical paths when UI is stable.

### 3.2 Webhook and Cron Trigger Flows

- **E2E webhook:** Register a webhook trigger, get URL and secret; send signed POST with payload; assert WorkflowRun created and (if worker runs) run completes or reaches expected step. Optionally verify logs in MongoDB.
- **E2E cron:** Create workflow with cron trigger (e.g. “every minute” or test schedule); wait or advance clock; assert at least one run created. May require test scheduler or short interval.

### 3.3 Failure, Retry, and Cancellation Flows

- **Failure:** Trigger workflow that has a step designed to fail (e.g. invalid connection or mock API returns 500); assert run status becomes failed, step shows error, logs available.
- **Retry:** If step retry is implemented, trigger step that fails once then succeeds; assert retry count and final success.
- **Cancellation:** Start a long-running run (or mock “running” state); call cancel; assert run status becomes canceled and (if runner supports it) job is not processed or is aborted.

---

## 4. Non-Functional Testing

### 4.1 Load Testing (Concurrency and Queue Saturation)

- **Goal:** Validate behavior under expected and peak load; find limits (max runs/minute, queue depth, API latency).
- **Scenarios:**
  - **API:** Sustained request rate to login, GraphQL queries, and run trigger; measure latency (p50/p95/p99) and error rate. Ramp up until saturation or target (e.g. 95% success under N req/s).
  - **Queue:** Enqueue many workflow runs; measure throughput (runs completed per minute), queue depth over time, and worker utilization. Identify max concurrent runs and queue backlog behavior.
- **Tools:** k6, Artillery, or Locust for HTTP; custom script or queue metrics for Redis/BullMQ. Run against staging or dedicated load environment.
- **Output:** Report with throughput, latency, and saturation point; document “max runs/minute” and recommended limits for quotas (see checklist 13).

### 4.2 Chaos / Failure Testing for Worker and Job Interruptions

- **Goal:** Ensure system degrades gracefully when workers die, Redis or DB is briefly unavailable, or jobs fail mid-run.
- **Scenarios:**
  - **Worker kill:** Stop runner/worker mid-job; restart; assert job is retried or moved to failed and run state is consistent (no orphan “running” forever).
  - **Redis disconnect:** Restart Redis during enqueue or process; assert no silent data loss; queue recovers when Redis is back.
  - **DB disconnect:** Brief DB outage during run update; assert retries or clear error; no duplicate run creation when possible.
- **Tools:** Manual or scripted (e.g. kill process, restart Docker service); optionally Chaos Mesh or similar if on Kubernetes. Document outcomes and any required runbook updates.

### 4.3 Security Testing (Authz Boundary, Secret Leakage)

- **Authz boundary:** Tests that prove tenant isolation and role enforcement.
  - **Multi-tenant:** Create resources as Tenant A; call API with Tenant B’s JWT; assert 404 or 403 for all resources (apps, connections, workflows, runs). Use integration or E2E tests.
  - **Roles:** As Viewer, assert cannot create/update/delete apps, workflows, or connections; as Builder, assert can create workflow but not change tenant settings; as Admin/Owner, assert invite and role change allowed.
- **Secret leakage:** Assert secrets never appear in logs (e.g. grep test or structured log assertion); never in API responses (connection list, run output); never in error messages (mask or generic message). Can be automated in integration tests and as a security checklist in CI.

---

## 5. Summary: Checklist 10 Compliance

| Checklist item | Specification |
|----------------|---------------|
| Unit: Node API business rules | Vitest; auth, RBAC, invites, helpers; mocks for Prisma/external. |
| Unit: Python action execution engine | pytest; schema validation, request building, response handling, mapping. |
| Unit: Schema validation and mapping logic | Node (Zod, custom validators) and Python (JSON Schema, mapping) unit tests. |
| Integration: API + DB + queue | Real Postgres + Redis; auth, CRUD, queue enqueue; test DB and optional test worker. |
| Integration: Trigger to run lifecycle | Manual, webhook, cron paths create WorkflowRun and enqueue job; webhook signature validated. |
| Integration: Credential retrieval and secret masking | Resolve connection for run; API never returns plaintext secrets; testConnection and logs checked. |
| E2E: App → action → connection → workflow → run | API or browser E2E; full create flow and run to terminal state. |
| E2E: Webhook and cron trigger flows | Webhook signed POST creates run; cron creates run on schedule. |
| E2E: Failure/retry and cancellation flows | Failed run, retry behavior, cancel run; status and logs asserted. |
| Non-functional: Load testing | Concurrency and queue saturation; throughput and latency report; document limits. |
| Non-functional: Chaos/failure testing | Worker kill, Redis/DB interruption; recovery and consistency. |
| Non-functional: Security testing | Authz (tenant isolation, roles); no secret leakage in logs or API. |

This completes **10) Testing Strategy Checklist**.
