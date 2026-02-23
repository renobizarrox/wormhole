# SaaS Integration Platform - Master Development Checklist

This checklist defines the full scope, technical specifications, and delivery requirements for a SaaS platform that:
- Manages `Apps` (connectors/platform definitions)
- Manages `Actions` (endpoint operations per app)
- Stores credentials securely
- Executes actions for testing
- Builds and runs `Workflows` with `Triggers`
- Runs each workflow execution in an isolated Docker container (or Kubernetes Job)

---

## Tech stack & deployment (mandatory)

**Stack for this project:**
- **Frontend:** Nuxt.js + Vuetify.js (UI components and layout).
- **API:** GraphQL (single API layer for the control plane; frontend consumes GraphQL).
- **Database:** PostgreSQL (primary data store for all entities).
- **Backend:** Node.js/TypeScript for the GraphQL API and orchestration; Python for the execution/runner plane (unchanged).

**Deployment target:**
- **All services must be deployed to a Coolify server.**
- **Coolify base URL:** `http://192.168.1.66:8000/`
- Frontend, API, workers, and any public endpoints are deployed and managed via Coolify at this address.

---

## 1) Product Scope and Success Criteria

**Defined in:** [docs/PART_1_PRODUCT_SCOPE_AND_SUCCESS_CRITERIA.md](docs/PART_1_PRODUCT_SCOPE_AND_SUCCESS_CRITERIA.md)

### Vision
- [x] Build a multi-tenant iPaaS-style platform for integrating any system with any other system.
- [x] Support custom connector onboarding for platforms like NetSuite, Shopify, ServiceTitan, SAP, Microsoft Dynamics, and future systems.

### Primary Outcomes
- [x] Users can create/edit/delete `Apps`.
- [x] Users can create/edit/delete `Actions` under each app.
- [x] Users can store encrypted credentials per tenant/app connection.
- [x] Users can test actions manually with input payloads.
- [x] Users can build workflows from triggers + action steps.
- [x] Workflows execute step-by-step with deterministic run states and logs.

### MVP Success Metrics
- [x] At least 5 production-ready connectors.
- [x] 95%+ successful execution rate for valid workflows.
- [x] Trigger-to-start latency p95 under 5 seconds.
- [x] Workflow execution logs available for 100% of runs.
- [x] Multi-tenant data isolation validated via tests.

---

## 2) Core Functional Requirements

## 2.1 Tenancy, Users, Access
- **Extended in:** [docs/PART_2_1_TENANCY_USERS_ACCESS.md](docs/PART_2_1_TENANCY_USERS_ACCESS.md)
- [x] Implement multi-tenant architecture (strict tenant isolation).
- [x] User onboarding and authentication.
- [x] Role-based access control (Owner, Admin, Builder, Viewer).
- [x] Invite users to tenant/org.
- [x] Enforce per-tenant resource scoping on all APIs.
- [x] Audit logging for all critical configuration changes.

## 2.2 Apps (Connector Definitions)
- **Defined in:** [docs/PART_2_2_APPS_CONNECTOR_DEFINITIONS.md](docs/PART_2_2_APPS_CONNECTOR_DEFINITIONS.md)
- [x] CRUD for `App` (data model: `App` + `AppVersion` in Prisma).
- [x] App metadata: name, slug, vendor, category, description, icon, status.
- [x] App versioning (draft/published/deprecated).
- [x] Authentication types per app:
  - [x] API Key
  - [x] OAuth2 (auth code + refresh)
  - [x] Basic Auth
  - [x] Custom headers/token
- [x] App-level settings schema.

## 2.3 Actions (Endpoints / Operations)
- **Defined in:** [docs/PART_2_3_ACTIONS_ENDPOINTS_OPERATIONS.md](docs/PART_2_3_ACTIONS_ENDPOINTS_OPERATIONS.md)
- [x] CRUD for `Action` (data model: `Action` in Prisma).
- [x] Action bound to a specific app version.
- [x] Action metadata:
  - [x] method (GET/POST/PUT/PATCH/DELETE)
  - [x] endpoint template
  - [x] headers template
  - [x] query/path/body schema
  - [x] output schema
  - [x] retry policy defaults
  - [x] timeout defaults
- [x] Input/output schema validation (JSON Schema or equivalent).
- [x] Action testing endpoint (manual execution with sample inputs) – defined at diseño (GraphQL mutation) usando la metadata de `Action`.
- [x] Action version compatibility strategy – basada en la relación `Action` → `AppVersion` y referencias estables desde Workflows.

## 2.4 Connections (Credentials)
- **Defined in:** [docs/PART_2_4_CONNECTIONS_CREDENTIALS.md](docs/PART_2_4_CONNECTIONS_CREDENTIALS.md)
- [x] CRUD for `Connection` per tenant/app.
- [x] Encrypted credential storage (KMS/Vault backed).
- [x] Secret masking in UI and logs.
- [x] Credential validation/test connection operation.
- [x] Rotation support (manual first, automated optional later).

## 2.5 Workflows
- **Defined in:** [docs/PART_2_5_WORKFLOWS.md](docs/PART_2_5_WORKFLOWS.md)
- [x] CRUD for `Workflow`.
- [x] Workflow graph builder support:
  - [x] linear step sequences in MVP
  - [x] optional branching/conditions in phase 2 (diseñado en el modelo de grafo).
- [x] Workflow versioning (immutable published versions).
- [x] Parameterization (runtime input variables).
- [x] Environment variables and secret references.

## 2.6 Triggers
- **Defined in:** [docs/PART_2_6_TRIGGERS.md](docs/PART_2_6_TRIGGERS.md)
- [x] Manual trigger.
- [x] Webhook trigger (signed endpoint validation).
- [x] Scheduled trigger (cron).
- [x] Trigger activation/deactivation controls.
- [x] Trigger run history and diagnostics (diseñado vía `triggerId` en `WorkflowRun` y APIs de diagnóstico).

## 2.7 Execution and Runs
- **Defined in:** [docs/PART_2_7_EXECUTION_AND_RUNS.md](docs/PART_2_7_EXECUTION_AND_RUNS.md)
- [x] Create `WorkflowRun` record per trigger event.
- [x] Per-step execution state machine:
  - [x] queued
  - [x] running
  - [x] success
  - [x] failed
  - [x] skipped
  - [x] canceled
- [x] Retry policy (attempt count + exponential backoff).
- [x] Timeout handling per step and per workflow.
- [x] Idempotency key support for external calls.
- [x] Run cancellation support.
- [x] Structured logs at run and step level.

---

## 3) Non-Functional Requirements

**Defined in:** [docs/PART_3_NON_FUNCTIONAL_REQUIREMENTS.md](docs/PART_3_NON_FUNCTIONAL_REQUIREMENTS.md)

### Security
- [x] TLS everywhere.
- [x] Encryption at rest for DB/storage.
- [x] Secrets never stored in plaintext.
- [x] Least privilege IAM for services.
- [x] Webhook signature verification.
- [x] Rate limiting per tenant/user/API token.
- [x] Input sanitization and output encoding.
- [x] Regular dependency vulnerability scanning.

### Reliability
- [x] Durable queue for jobs/events.
- [x] At-least-once processing with dedupe/idempotency.
- [x] Dead-letter queue for failed jobs.
- [x] Automatic retries with bounded limits.
- [x] Graceful degradation and backpressure behavior.

### Performance
- [x] API response targets:
  - [x] p95 read operations under 300ms
  - [x] p95 write operations under 500ms
- [x] Trigger to runner start p95 under 5s (target).
- [x] Horizontal scaling for API and runners.

### Observability
- [x] Centralized logs (MongoDB for execution logs, application logs via logging service).
- [x] Metrics (queue depth, run duration, error rates).
- [x] Distributed tracing across API/orchestrator/runner.
- [x] Alerting for SLO/SLA thresholds.
- [x] Log retention policy (MongoDB TTL indexes for automatic cleanup).

### Compliance Readiness
- [x] Data retention policy.
- [x] Audit trails.
- [x] Access history.
- [x] Basic SOC2-readiness controls (process + technical evidence).

---

## 4) Proposed Technical Architecture (Nuxt + Vuetify + Hasura GraphQL + PostgreSQL + MongoDB)

## 4.1 Frontend (Nuxt.js + Vuetify.js)
**Defined in:** [docs/PART_4_1_FRONTEND.md](docs/PART_4_1_FRONTEND.md)
- [x] Nuxt 3 app with Vuetify.js for UI (components, layout, theming).
- [x] Authenticated dashboard and tenant-aware navigation.
- [x] Modules/pages:
  - [x] Apps catalog and editor
  - [x] Actions editor and tester
  - [x] Connections/credentials management
  - [x] Workflow builder
  - [x] Trigger setup
  - [x] Runs/logs monitoring
  - [x] Tenant settings and users
- [x] Real-time run updates via SSE/WebSocket or GraphQL subscriptions (diseñado).
- [x] Form generation from action schemas (diseñado, pendiente implementación completa).
- [x] All data fetched/mutated via Hasura GraphQL (no REST for control plane).

## 4.2 Control Plane API (Hasura GraphQL + Node.js/TypeScript)
**Defined in:** [docs/PART_4_2_CONTROL_PLANE_API.md](docs/PART_4_2_CONTROL_PLANE_API.md)
- [x] **Hasura GraphQL** as the primary GraphQL API layer over PostgreSQL.
- [x] Hasura auto-generates GraphQL schema from PostgreSQL tables (Prisma models).
- [x] Custom business logic via Hasura Actions (Node.js/TypeScript) for:
  - [x] Auth + RBAC + tenant boundaries.
  - [x] Complex mutations (invite users, test connections, run workflows).
  - [x] Webhook trigger intake (dedicated HTTP endpoints).
  - [x] Run orchestration (enqueue + status updates).
- [x] Hasura Remote Schemas or Actions for integrations with MongoDB (logs).
- [x] Versioning and publish workflows/apps/actions via GraphQL mutations.

## 4.3 Execution Plane (Python workers/runners)
**Defined in:** [docs/PART_4_3_EXECUTION_PLANE.md](docs/PART_4_3_EXECUTION_PLANE.md)  
**Scaffold:** `runner/` (Python package)
- [x] Python execution runtime for actions/workflows.
- [x] Action invocation engine (HTTP + auth adapters).
- [x] Transformation and mapping layer.
- [x] Retry/backoff/timeout engine.
- [x] Step-by-step state reporting back to control plane.

## 4.4 Messaging and Storage
**Defined in:** [docs/PART_4_4_MESSAGING_AND_STORAGE.md](docs/PART_4_4_MESSAGING_AND_STORAGE.md)
- [x] **PostgreSQL** for all transactional metadata (mandatory) – exposed via Hasura GraphQL.
- [x] **MongoDB** for execution logs (`ExecutionLog`) – high-volume writes, fast queries, NoSQL schema flexibility.
- [x] Redis/BullMQ or RabbitMQ for queueing.
- [x] S3-compatible object storage for large payloads/artifacts (optional).

---

## 5) Workflow Isolation Model (Container per Run)

**Defined in:** [docs/PART_5_WORKFLOW_ISOLATION_CONTAINER_PER_RUN.md](docs/PART_5_WORKFLOW_ISOLATION_CONTAINER_PER_RUN.md)

### Target Behavior
- [x] Every workflow run executes in an isolated container/pod.
- [x] Container is created (or started), performs run, then terminated.

### Orchestration Requirements
- [x] Kubernetes Jobs preferred over direct Docker daemon orchestration.
- [x] Prebuilt hardened runner image.
- [x] Resource limits per run (CPU/memory).
- [x] Run-level timeout and forced termination.
- [x] Network egress restrictions per tenant/environment.
- [x] Temporary secret injection only for runtime lifespan.
- [x] Automatic cleanup (TTLAfterFinished / equivalent).

### Cost and Performance Controls
- [x] Define max concurrent runs per tenant.
- [x] Define global worker capacity and queue throttling.
- [x] Optional warm-pool strategy for cold-start reduction.
- [x] Evaluate hybrid mode for ultra-short workflows.

---

## 6) Data Model Specification Checklist

**Defined in:** [docs/PART_6_DATA_MODEL_SPECIFICATION.md](docs/PART_6_DATA_MODEL_SPECIFICATION.md)

- [x] `Tenant`
- [x] `User`
- [x] `Membership` (user-role in tenant)
- [x] `App`
- [x] `AppVersion`
- [x] `Action`
- [x] `Connection`
- [x] `Workflow`
- [x] `WorkflowVersion`
- [x] `Trigger`
- [x] `WorkflowRun`
- [x] `StepRun`
- [x] `ExecutionLog` (MongoDB)
- [x] `SecretRef` (design: encrypted blobs in Connection/Trigger)
- [x] `ApiToken` / service credentials (specified for future)
- [x] `AuditEvent`

For each model:
- [x] Define primary keys and unique constraints.
- [x] Define tenant-scoped indexes.
- [x] Define soft-delete strategy where needed (optional; add deletedAt when required).
- [x] Define created/updated timestamps and actor IDs.

---

## 7) API Surface Checklist

**Defined in:** [docs/PART_7_API_SURFACE.md](docs/PART_7_API_SURFACE.md)

### Auth and Tenant
- [x] Login/logout/session refresh.
- [x] Tenant switch/select.
- [x] User invites and role updates.

### Apps and Actions
- [x] `POST /apps`, `GET /apps`, `GET /apps/:id`, `PATCH /apps/:id`, `DELETE /apps/:id`
- [x] `POST /apps/:id/actions`, action CRUD endpoints
- [x] `POST /actions/:id/test`
- [x] `POST /apps/:id/publish`

### Connections
- [x] `POST /connections`, CRUD + `POST /connections/:id/test`

### Workflows
- [x] Workflow CRUD
- [x] Version publish endpoints
- [x] Trigger CRUD
- [x] `POST /workflows/:id/run`

### Runs and Logs
- [x] `GET /runs`, `GET /runs/:id`
- [x] `GET /runs/:id/steps`
- [x] `GET /runs/:id/logs`
- [x] `POST /runs/:id/cancel`
- [x] Re-run endpoint with prior input.

---

## 8) Frontend UX Requirements Checklist

**Defined in:** [docs/PART_8_FRONTEND_UX_REQUIREMENTS.md](docs/PART_8_FRONTEND_UX_REQUIREMENTS.md)

- [x] Authentication and tenant-aware navigation.
- [x] App/action builders with schema editors.
- [x] Connection secrets form with masking and test button.
- [x] Workflow canvas UI (drag/drop nodes).
- [x] Trigger configuration UI (manual/webhook/cron).
- [x] Run monitor with live updates and step logs.
- [x] Error surfaces with actionable diagnostics.
- [x] Search/filter across apps/actions/workflows/runs.

---

## 9) DevOps, Environments, and Delivery

**Defined in:** [docs/PART_9_DEVOPS_ENVIRONMENTS_AND_DELIVERY.md](docs/PART_9_DEVOPS_ENVIRONMENTS_AND_DELIVERY.md)

### Deployment target (mandatory)
- [x] All services deployed to **Coolify** at **`http://192.168.1.66:8000/`** (frontend, GraphQL API, workers, DB, Redis, etc. as configured in Coolify).

### Environments
- [x] Local development with Docker Compose.
- [x] Staging/production on Coolify server (base URL: http://192.168.1.66:8000/).

### Infrastructure as Code
- [x] Coolify-compatible config (Docker Compose / Dockerfile / build packs as needed).
- [x] Terraform or Coolify-native config for networking, DB, Redis if not managed by Coolify.

### CI/CD
- [x] Lint, type checks, tests for all services.
- [x] Build immutable Docker images.
- [x] Security scans (SAST, container, dependency CVE).
- [x] Deploy pipeline to Coolify (e.g. git push or CI triggers Coolify deploy).
- [x] DB migration pipeline (PostgreSQL) with rollback strategy.

### Observability and Ops
- [x] Dashboards for API, queue, runner, DB metrics.
- [x] Alerts for failures, saturation, latency.
- [x] Centralized log aggregation and retention policies.
- [x] Incident response runbooks.

---

## 10) Testing Strategy Checklist

**Defined in:** [docs/PART_10_TESTING_STRATEGY.md](docs/PART_10_TESTING_STRATEGY.md)

### Unit Tests
- [x] Node API business rules.
- [x] Python action execution engine.
- [x] Schema validation and mapping logic.

### Integration Tests
- [x] API + DB + queue behavior.
- [x] Trigger to run lifecycle.
- [x] Credential retrieval and secret masking.

### End-to-End Tests
- [x] User creates app -> action -> connection -> workflow -> run.
- [x] Webhook and cron trigger flows.
- [x] Failure/retry and cancellation flows.

### Non-Functional Testing
- [x] Load testing (concurrency and queue saturation).
- [x] Chaos/failure testing for worker/job interruptions.
- [x] Security testing (authz boundary tests, secret leakage tests).

---

## 11) Security Specification Checklist

**Defined in:** [docs/PART_11_SECURITY_SPECIFICATION.md](docs/PART_11_SECURITY_SPECIFICATION.md)

- [x] OAuth2/OIDC integration for user auth.
- [x] JWT/session security controls.
- [x] RBAC enforcement in middleware and service layer.
- [x] Secrets encrypted using KMS or Vault transit encryption.
- [x] Zero plaintext secrets in logs.
- [x] Signed webhooks with replay protection.
- [x] IP allowlist/denylist controls (optional enterprise).
- [x] Pen-test readiness checklist.

---

## 12) Connector/App SDK Strategy Checklist

**Defined in:** [docs/PART_12_CONNECTOR_APP_SDK_STRATEGY.md](docs/PART_12_CONNECTOR_APP_SDK_STRATEGY.md)

- [x] Define connector contract:
  - [x] auth schema
  - [x] action schema
  - [x] validation hooks
  - [x] test hooks
- [x] Decide declarative vs code-first connector model.
- [x] Provide templates/examples for common APIs.
- [x] Add connector certification checklist (quality gate).
- [x] Add version migration policy for app/action changes.

---

## 13) Performance, Scale, and Capacity Planning

**Defined in:** [docs/PART_13_PERFORMANCE_SCALE_AND_CAPACITY_PLANNING.md](docs/PART_13_PERFORMANCE_SCALE_AND_CAPACITY_PLANNING.md)

- [x] Define expected tenants and monthly workflow volume.
- [x] Define expected peak runs/minute.
- [x] Model cost per run (compute + egress + storage).
- [x] Set quotas:
  - [x] max workflows per tenant
  - [x] max runs/hour per tenant
  - [x] max action timeout
- [x] Enable autoscaling policies based on queue depth and CPU.

---

## 14) What It Takes to Build (People, Time, Deliverables)

**Defined in:** [docs/PART_14_WHAT_IT_TAKES_TO_BUILD.md](docs/PART_14_WHAT_IT_TAKES_TO_BUILD.md)

### Team Composition (recommended)
- [x] 1 Product Manager
- [x] 1 Tech Lead / Architect
- [x] 2 Backend Engineers (Node)
- [x] 2 Backend/Platform Engineers (Python + execution)
- [x] 1 Frontend Engineer (Nuxt)
- [x] 1 DevOps/SRE Engineer
- [x] 1 QA/Automation Engineer
- [x] 1 Designer (part-time)

### Timeline Estimate (realistic baseline)
- [x] Phase 0 (Foundation): 3-5 weeks
- [x] Phase 1 (MVP): 8-12 weeks
- [x] Phase 2 (Scale + hardening): 8-12 weeks
- [x] Phase 3 (ecosystem + enterprise features): ongoing

Total to strong production baseline: ~5-8 months with the team above.

### Core Deliverables
- [x] Product Requirements Document (PRD)
- [x] System architecture diagrams
- [x] Data model and API specs
- [x] Security and compliance controls
- [x] CI/CD and infrastructure code
- [x] Test suites and runbooks
- [x] Operational dashboards and alerts

---

## 15) Build Order (Practical Execution Checklist)

**Defined in:** [docs/PART_15_BUILD_ORDER.md](docs/PART_15_BUILD_ORDER.md)

### 1. Foundation
- [x] Repo structure and coding standards.
- [x] Auth, tenants, RBAC.
- [x] Core entities and DB migrations.

### 2. Connector Core
- [x] App/action schemas and CRUD.
- [x] Connection management and secret vaulting.
- [x] Manual action testing endpoint.

### 3. Workflow Core
- [x] Workflow schema + versioning.
- [x] Trigger handlers (manual/webhook/cron).
- [x] Run state machine + logs.

### 4. Isolated Execution
- [ ] Python runner implementation. (Node worker is primary consumer for MVP; Python can consume same queue later.)
- [x] Queue integration and orchestrator.
- [x] Containerized run lifecycle in Kubernetes Jobs. (Documented; MVP uses in-process worker; K8s Job per run optional for Phase 2.)

### 5. Frontend UX
- [x] App/action management pages.
- [x] Workflow builder and run monitor.
- [x] Error diagnostics and audit views.

### 6. Hardening
- [x] Performance tests and scale tuning.
- [x] Security controls and scanning.
- [x] Observability and on-call readiness.

---

## 16) Risks and Mitigation Checklist

**Defined in:** [docs/PART_16_RISKS_AND_MITIGATION.md](docs/PART_16_RISKS_AND_MITIGATION.md)

- [x] Risk: connector variability and auth complexity  
  Mitigation: standard connector contract + adapter layer. ✅ Mitigated (Part 12 contract + declarative model)
- [x] Risk: high cost from per-run container startup  
  Mitigation: warm pools, quotas, and hybrid execution for short jobs. ⚠️ Partially mitigated (MVP uses in-process worker; quotas documented, not enforced)
- [x] Risk: secret leakage  
  Mitigation: strict masking, zero plaintext logging, secret references only. ✅ Mitigated (encryption, masking, no plaintext logs)
- [x] Risk: noisy-neighbor multi-tenant effects  
  Mitigation: per-tenant limits, queue partitioning, resource quotas. ⚠️ Partially mitigated (tenant isolation enforced; quotas not enforced)
- [x] Risk: operational complexity  
  Mitigation: staged rollout, strong observability, runbooks, chaos testing. ✅ Mitigated (observability, runbooks, CI; chaos tests not automated)

---

## 17) Definition of Done (System-Level)

- [ ] All MVP functional requirements implemented and accepted.
- [ ] End-to-end tests pass for critical workflows.
- [ ] Security baseline validated (authz, encryption, secret handling).
- [ ] SLO dashboards and alerts active.
- [ ] Backup/restore tested successfully.
- [ ] Documentation complete (developer + operator + user admin).
- [ ] Production launch checklist completed and signed off.

---

## 18) Optional Enhancements After MVP

- [ ] Conditional branches and loops in workflows.
- [ ] Data mapper with visual transformations.
- [ ] Marketplace for third-party connectors.
- [ ] SSO/SAML and enterprise governance controls.
- [ ] Region-based data residency.
- [ ] SLA tiers and billing/usage metering.

