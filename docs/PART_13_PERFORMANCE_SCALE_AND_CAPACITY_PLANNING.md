# Part 13 – Performance, Scale, and Capacity Planning

This document specifies **performance, scale, and capacity planning** (section 13 of the main checklist): expected load, cost model, quotas, and autoscaling. It aligns with [PART_1_PRODUCT_SCOPE_AND_SUCCESS_CRITERIA.md](./PART_1_PRODUCT_SCOPE_AND_SUCCESS_CRITERIA.md) (MVP metrics) and [PART_3_NON_FUNCTIONAL_REQUIREMENTS.md](./PART_3_NON_FUNCTIONAL_REQUIREMENTS.md) (performance NFRs).

---

## 1. Expected Tenants and Monthly Workflow Volume

- **Purpose:** Define baseline and growth assumptions so capacity and quotas can be set.
- **Specification:**
  - **Tenants:** Define expected number of tenants at launch and at 6/12 months (e.g. 10 at launch, 50 at 6 months, 200 at 12 months). Used for DB sizing, connection limits, and support load.
  - **Monthly workflow volume:** Total WorkflowRuns per month across all tenants (e.g. 10K at launch, 100K at 6 months, 500K at 12 months). Drives queue capacity, runner pool size, and log retention sizing (MongoDB).
  - **Document:** Store these assumptions in a one-page capacity brief (this doc or a linked spreadsheet). Update quarterly or when planning a scale milestone.
- **Example (MVP baseline):** 5–20 tenants, 5K–20K runs/month. Scale targets: 50 tenants, 100K runs/month within 12 months.

---

## 2. Expected Peak Runs per Minute

- **Purpose:** Size the queue and runner pool for burst load so trigger-to-start latency stays within SLO (e.g. p95 < 5 s).
- **Specification:**
  - **Peak runs/minute:** Define expected peak rate (e.g. 10 runs/min at launch, 50 runs/min at 6 months, 200 runs/min at scale). This is the rate at which new WorkflowRuns are created (manual + webhook + cron).
  - **Concurrent runs:** Peak runs/minute × average run duration (in minutes) gives rough concurrent runs. E.g. 20 runs/min × 2 min avg = 40 concurrent runs. Runner pool and queue consumers must handle this.
  - **Document:** State peak runs/minute and average run duration; use for queue depth alerts and worker scaling (Part 9 observability).
- **Example (MVP):** Peak 5–15 runs/min; avg run duration 1–3 min; plan for 20–50 concurrent runs.

---

## 3. Model Cost per Run (Compute + Egress + Storage)

- **Purpose:** Understand unit economics and set pricing or cost controls.
- **Specification:**
  - **Compute:** Cost per run = (runner container CPU/memory × run duration) + orchestration overhead. For Kubernetes Jobs or Docker-per-run: estimate per-run compute cost (e.g. 0.1 vCPU × 2 min, or fixed cost per job). Include queue processing (Redis/worker) if significant.
  - **Egress:** Data out to external APIs and to MongoDB (logs). Estimate bytes per run (request/response + log payload); apply egress $/GB if applicable.
  - **Storage:** PostgreSQL (run metadata, step runs), MongoDB (execution logs). Per-run storage = row sizes × retention; estimate $/GB-month for DB and log storage.
  - **Output:** Simple formula or spreadsheet: cost_per_run = f(compute, egress, storage). Use for quotas and billing (if usage-based pricing is added later).
- **Example:** Cost per run ≈ $0.01–0.05 (MVP, single region, small payloads). Refine with real metrics after launch.

---

## 4. Quotas

### 4.1 Max Workflows per Tenant

- **Purpose:** Limit total number of Workflow definitions per tenant to control DB size and list/query load.
- **Specification:** Define a default and max (e.g. default 50 workflows per tenant, max 200). Enforce in API when creating a workflow (count existing workflows for tenant; reject if at limit). Optional: different tiers (e.g. free vs paid) with different limits.
- **Storage:** Quota can be in config (env) or in a tenant/metadata table. Document in admin docs.

### 4.2 Max Runs per Hour per Tenant

- **Purpose:** Prevent a single tenant from saturating the queue and impacting others (noisy neighbor).
- **Specification:** Define limit (e.g. 100 runs/hour per tenant at MVP, 500/hour at scale). When creating a WorkflowRun (manual, webhook, cron), check count of runs created in the last hour for that tenant; reject with 429 if over limit. Optionally use a sliding window or token bucket.
- **Implementation:** Node/orchestrator or queue middleware; counter in Redis keyed by tenantId and hour (or rolling window).

### 4.3 Max Action Timeout

- **Purpose:** Cap single-step duration so runaway steps do not hold resources indefinitely.
- **Specification:** Global max timeout per action (e.g. 300 s = 5 min). Stored per-Action `timeoutMs` must not exceed this cap (e.g. 300_000 ms). Runner enforces timeout and terminates the step; run fails with timeout error. Document in connector and run docs.
- **Default:** Per Part 2.3 / schema, Action has `timeoutMs` (default 30 s). Cap at 300 s unless overridden by platform config.

---

## 5. Autoscaling Policies (Queue Depth and CPU)

- **Purpose:** Scale workers and runners with load so queue does not grow unbounded and latency stays within SLO.
- **Specification:**
  - **Queue depth:** Define target max queue depth (e.g. pending jobs < 100) and scale trigger (e.g. scale up when pending > 50 for 2 minutes). Add more worker replicas (Node queue consumers and/or Python runner workers) when depth exceeds threshold; scale down when depth is low and CPU is idle.
  - **CPU (and memory):** Scale runner pool based on CPU utilization (e.g. scale up when avg CPU > 70%, scale down when < 30%). Coolify or Kubernetes HPA can use queue depth and/or CPU.
  - **Document:** State scaling triggers and min/max replicas in Part 9 (DevOps) or in runbooks. Alerts when approaching max capacity (Part 9).
- **Reference:** PART_3_NON_FUNCTIONAL_REQUIREMENTS (horizontal scaling, backpressure); PART_9 (Coolify, dashboards, alerts).

---

## 6. Summary: Checklist 13 Compliance

| Checklist item | Specification |
|----------------|----------------|
| Define expected tenants and monthly workflow volume | Document tenant count and runs/month at launch and 6/12 months; use for capacity brief. |
| Define expected peak runs/minute | Document peak runs/min and avg run duration; use for queue and runner sizing. |
| Model cost per run (compute + egress + storage) | Formula or spreadsheet: compute, egress, storage per run; refine with metrics. |
| Set quotas: max workflows per tenant | Default/max workflows per tenant; enforce on create. |
| Set quotas: max runs/hour per tenant | Limit runs/hour per tenant; enforce with 429; use Redis counter or sliding window. |
| Set quotas: max action timeout | Global cap (e.g. 300 s); Action.timeoutMs cannot exceed; runner enforces. |
| Enable autoscaling policies (queue depth and CPU) | Scale workers/runners on queue depth and CPU; document triggers and min/max replicas. |

This completes **13) Performance, Scale, and Capacity Planning** checklist.
