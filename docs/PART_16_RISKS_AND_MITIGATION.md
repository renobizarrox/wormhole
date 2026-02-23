# Part 16 – Risks and Mitigation

This document assesses the risks identified in the main checklist (section 16) and documents the mitigations in place or planned.

---

## 1. Risk: Connector Variability and Auth Complexity

**Risk:** Different connectors require different authentication methods, credential shapes, and API patterns. Without standardization, the platform becomes hard to maintain and extend.

**Mitigation:** Standard connector contract + adapter layer.

### Status: ✅ Mitigated

**Implemented:**

- **Standard connector contract** (Part 12): All connectors follow a unified contract:
  - **Auth schema:** Fixed auth types (`API_KEY`, `OAUTH2`, `BASIC`, `CUSTOM_HEADER`) with defined credential shapes per type (e.g. OAuth2: `clientId`, `clientSecret`, `refreshToken`, `accessToken`).
  - **Action schema:** Consistent structure: `method`, `endpointTemplate`, `headersTemplate`, `querySchema`, `pathSchema`, `bodySchema`, `outputSchema`, retry/timeout settings.
  - **Validation hooks:** On save, publish, test connection, and run execution; schemas validated as JSON Schema.
  - **Test hooks:** `testConnection` and `testAction` endpoints for verification.
- **Declarative model (MVP):** Connectors are data-driven (stored in DB as App/AppVersion/Action); no custom code per connector. The runner interprets definitions generically.
- **Adapter layer:** The runner (`api/src/lib/runExecutor.ts`, `api/src/routes/actions.ts`) builds HTTP requests from Action definitions and connection credentials uniformly, regardless of connector.

**References:**
- `docs/PART_12_CONNECTOR_APP_SDK_STRATEGY.md` – connector contract specification
- `api/prisma/schema.prisma` – App, AppVersion, Action models enforce contract
- `api/src/routes/actions.ts` – generic test action handler

**Future enhancements:**
- Code-first connectors (custom adapter code) can be added later while maintaining the contract.

---

## 2. Risk: High Cost from Per-Run Container Startup

**Risk:** Starting a container per workflow run incurs cold-start latency and compute cost, especially for short workflows.

**Mitigation:** Warm pools, quotas, and hybrid execution for short jobs.

### Status: ⚠️ Partially Mitigated (Documented, Not Implemented)

**Documented:**

- **Warm pools:** Part 5 mentions optional warm-pool strategy for cold-start reduction (not implemented in MVP).
- **Quotas:** Part 13 defines:
  - Max workflows per tenant (default 50, max 200) – **not enforced in code**
  - Max runs/hour per tenant (e.g. 100/hour MVP, 500/hour scale) – **not enforced in code**
  - Max action timeout (300 s cap) – enforced per Action `timeoutMs` (default 30 s)
- **Hybrid execution:** Part 5 mentions evaluating hybrid mode for ultra-short workflows (in-process vs container) – **not implemented**

**Current state:**

- MVP uses in-process Node worker (not per-run containers) when `REDIS_URL` is set; falls back to in-process execution without Redis. This avoids container startup cost for MVP.
- Container-per-run (Kubernetes Jobs) is documented as optional for Phase 2 (Part 15).

**Action items:**

- [ ] Enforce quotas in API: check workflow count and runs/hour before creating resources (return 429 if exceeded).
- [ ] Implement warm pools if moving to container-per-run.
- [ ] Evaluate hybrid mode (in-process for < 1s workflows, container for longer).

**References:**
- `docs/PART_5_WORKFLOW_ISOLATION_CONTAINER_PER_RUN.md` – container strategy
- `docs/PART_13_PERFORMANCE_SCALE_AND_CAPACITY_PLANNING.md` – quotas specification
- `api/src/lib/queue.ts` – current in-process worker

---

## 3. Risk: Secret Leakage

**Risk:** Connection credentials, webhook secrets, or other sensitive data could be exposed in logs, API responses, or error messages.

**Mitigation:** Strict masking, zero plaintext logging, secret references only.

### Status: ✅ Mitigated

**Implemented:**

- **Encryption:** Connection credentials encrypted with AES-256-GCM (`api/src/lib/encryption.ts`). Stored as `secretCipher` (Buffer) in DB; never stored in plaintext.
- **API masking:** `maskConnection()` function (`api/src/routes/connections.ts`) replaces `secretCipher` with `'[REDACTED]'` in all API responses (GET list, GET by id, create, update).
- **Webhook secrets:** Trigger webhook secrets encrypted (`webhookSecretCipher`) and masked in responses (`maskTrigger()`).
- **No plaintext in logs:** Credentials decrypted only in memory during execution (`api/src/routes/actions.ts`, `api/src/routes/connections.ts` test endpoints); never logged.
- **Frontend:** UI never receives plaintext secrets; credentials shown only during create/edit (user input), then masked after save (`web/pages/connections.vue`).

**Verification:**

- Authz tests (`api/src/routes/authz.test.ts`) verify API behavior; manual review confirms masking.
- Encryption key required in production (`ENCRYPTION_KEY` env var, 64-char hex).

**References:**
- `api/src/lib/encryption.ts` – encryption/decryption
- `api/src/routes/connections.ts` – `maskConnection()` function
- `api/src/routes/triggers.ts` – `maskTrigger()` function
- `docs/PART_2_4_CONNECTIONS_CREDENTIALS.md` – secret handling spec

**Future enhancements:**

- Replace AES-256-GCM with KMS/Vault in production (Part 11); current implementation supports key rotation via `ENCRYPTION_KEY`.

---

## 4. Risk: Noisy-Neighbor Multi-Tenant Effects

**Risk:** One tenant consuming excessive resources (runs, DB queries, queue depth) impacts other tenants’ performance and availability.

**Mitigation:** Per-tenant limits, queue partitioning, resource quotas.

### Status: ⚠️ Partially Mitigated (Isolation Enforced, Quotas Not Enforced)

**Implemented:**

- **Tenant isolation:** All queries scoped by `tenantId`:
  - Apps, Actions, Connections, Workflows, Triggers, Runs scoped to tenant
  - JWT contains `tenantId`; middleware enforces tenant context
  - No cross-tenant data access possible via API
- **Queue:** BullMQ queue (`workflow-runs`) is shared; jobs include `workflowRunId` which maps to tenant via DB. No per-tenant queue partitioning yet.
- **DB indexes:** Tenant-scoped indexes on key tables (e.g. `workflow_runs_tenant_id_status_idx`) for efficient per-tenant queries.

**Not implemented (documented in Part 13):**

- **Quotas:** Max workflows per tenant, max runs/hour per tenant – **not enforced in API code**
- **Queue partitioning:** Per-tenant queues or priority tiers – **not implemented**
- **Resource quotas:** CPU/memory limits per tenant – **not implemented** (would require container-per-run + K8s resource quotas)

**Action items:**

- [ ] Enforce max workflows per tenant: check count before `POST /workflows`; return 429 if exceeded.
- [ ] Enforce max runs/hour per tenant: Redis counter keyed by `tenantId:hour`; check before creating WorkflowRun; return 429 if exceeded.
- [ ] Consider queue partitioning (per-tenant queues or priority) if queue depth becomes an issue.
- [ ] Add resource quotas if moving to container-per-run (K8s ResourceQuota per tenant namespace).

**References:**
- `api/src/routes/*.ts` – all routes filter by `payload.tenantId`
- `docs/PART_13_PERFORMANCE_SCALE_AND_CAPACITY_PLANNING.md` – quotas spec
- `api/src/lib/queue.ts` – shared queue (no partitioning)

---

## 5. Risk: Operational Complexity

**Risk:** Managing multi-tenant SaaS with queues, workers, DB, logs, and secrets requires strong operational practices. Without runbooks, observability, and staged rollout, incidents are hard to diagnose and resolve.

**Mitigation:** Staged rollout, strong observability, runbooks, chaos testing.

### Status: ✅ Mitigated (Documented and Partially Implemented)

**Implemented:**

- **Observability:**
  - Health endpoint: `GET /health` for liveness/readiness (`api/src/app.ts`)
  - Observability doc: `docs/OBSERVABILITY.md` (metrics, alerts, load test)
  - Runbook: `docs/runbooks/high-error-rate-or-queue-backup.md` (incident response)
- **CI/CD:** `.github/workflows/ci.yml` runs lint, typecheck, tests, audit
- **Security tests:** Authz tests verify tenant isolation and RBAC (`api/src/routes/authz.test.ts`)
- **Load testing:** k6 script `scripts/load/health.js` for baseline

**Documented (Part 9):**

- Dashboards: API, queue, runner, DB metrics (Coolify or Prometheus/Grafana)
- Alerts: Failures, saturation, latency breaches
- Centralized logs: Aggregation and retention (30–90 days)
- Incident runbooks: High error rate, queue backup, DB issues, migrations

**Not implemented:**

- **Staged rollout:** No canary or blue-green deployment strategy documented for Coolify
- **Chaos testing:** No automated chaos tests (worker kill, Redis disconnect, DB disconnect) – documented in Part 10 but not automated

**Action items:**

- [ ] Add chaos test scripts (e.g. kill worker mid-job, restart Redis, simulate DB outage) and document outcomes.
- [ ] Document staged rollout strategy for Coolify (if applicable) or manual rollout steps.
- [ ] Set up dashboards and alerts in production (Coolify or external monitoring).

**References:**
- `docs/OBSERVABILITY.md` – observability summary
- `docs/runbooks/high-error-rate-or-queue-backup.md` – incident runbook
- `docs/PART_9_DEVOPS_ENVIRONMENTS_AND_DELIVERY.md` – observability spec
- `docs/PART_10_TESTING_STRATEGY.md` – chaos testing spec

---

## Summary: Checklist 16 Compliance

| Risk | Mitigation Status | Notes |
|------|-------------------|-------|
| Connector variability and auth complexity | ✅ Mitigated | Standard contract (Part 12) + declarative model + generic runner |
| High cost from per-run container startup | ⚠️ Partially mitigated | MVP uses in-process worker; quotas documented but not enforced |
| Secret leakage | ✅ Mitigated | Encryption, masking, zero plaintext logging |
| Noisy-neighbor multi-tenant effects | ⚠️ Partially mitigated | Tenant isolation enforced; quotas not enforced |
| Operational complexity | ✅ Mitigated | Observability, runbooks, CI; chaos tests and staged rollout not automated |

**Overall:** Core risks (secret leakage, connector variability, operational readiness) are mitigated. Quota enforcement and advanced cost controls (warm pools, hybrid execution) are documented but not implemented and can be added as needed.
