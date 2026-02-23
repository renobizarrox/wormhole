# Part 5 – Workflow Isolation Model (Container per Run)

This document specifies how **each workflow run** executes in an **isolated container** (or pod), which is created for the run and then terminated. It covers target behaviour, orchestration requirements, and cost/performance controls.

---

## 1. Target Behaviour

### 1.1 Isolated Execution per Run

- **Requirement:** Every workflow run executes in its own isolated environment.
- **Behaviour:**
  - One run → one container (or Kubernetes Pod/Job).
  - No sharing of processes, filesystem, or network namespace with other runs or tenants.
  - Enables strong security (no cross-tenant leakage) and predictable resource usage.

### 1.2 Lifecycle: Create → Run → Terminate

- **Create:** When a run is enqueued (or when a worker picks it up), the orchestrator creates a new container/pod for that run (or allocates one from a warm pool; see below).
- **Run:** The container runs the runner process, which:
  - Pulls the job payload (workflowRunId, workflowVersionId, tenantId, input).
  - Fetches workflow definition and executes steps (action invocation, retry, reporting).
  - Writes logs to MongoDB and updates run/step status in PostgreSQL.
- **Terminate:** When the run finishes (success, failure, or timeout), the container is stopped and removed. No long-lived runner process sharing state with other runs.

**Checklist:** Every workflow run executes in an isolated container/pod; container is created (or started), performs run, then terminated.

---

## 2. Orchestration Requirements

### 2.1 Kubernetes Jobs Preferred

- **Recommendation:** Use **Kubernetes Jobs** (one Job per workflow run) rather than driving Docker directly on a single host.
- **Benefits:**
  - Scheduling, resource limits, and cleanup are built-in.
  - Scale by adding nodes; no single point of failure for the daemon.
  - TTL-after-finished and job history integrate with the cluster.
- **Alternative for MVP/small deployments:** Docker Compose or a single-host job runner that starts a container per run and removes it when done (e.g. `docker run --rm`). Can be upgraded to Kubernetes Jobs later.

### 2.2 Prebuilt Hardened Runner Image

- **Requirement:** The image used for the runner container must be prebuilt, versioned, and hardened.
- **Contents:** Python runtime, `wormhole-runner` package, minimal OS (e.g. slim/alpine base). No development tools or unnecessary packages in production image.
- **Hardening:** Run as non-root; read-only filesystem where possible; no secrets baked into the image; base image regularly updated for CVEs.

### 2.3 Resource Limits per Run

- **Requirement:** Each run (container/pod) has explicit CPU and memory limits.
- **Example:** `limits.cpu: 1`, `limits.memory: 512Mi` (tuned per environment). Requests can be set for scheduling.
- **Prevents:** A single run from exhausting node resources and affecting other runs or system services.

### 2.4 Run-Level Timeout and Forced Termination

- **Requirement:** A maximum allowed duration per run (e.g. 30 minutes). If exceeded, the run is forcibly terminated.
- **Implementation:**
  - Kubernetes: `activeDeadlineSeconds` on the Job.
  - Docker: `--stop-timeout` and external watchdog that kills the container.
- **State:** Orchestrator or runner marks the WorkflowRun as FAILED (or TIMEOUT) and performs cleanup.

### 2.5 Network Egress Restrictions

- **Requirement:** Optionally restrict outbound traffic per tenant or environment (e.g. allowlist of domains, or deny by default with explicit allow rules).
- **Implementation:** NetworkPolicy (Kubernetes) or firewall rules. Prevents a compromised or malicious workflow from reaching unintended endpoints.
- **MVP:** Can start with unrestricted egress and add policies when multi-tenant isolation or compliance requires it.

### 2.6 Temporary Secret Injection

- **Requirement:** Secrets (e.g. connection credentials) are injected only for the lifetime of the run (e.g. env vars or mounted files created when the container starts, removed when it stops).
- **No persistence:** Secrets must not be written to disk in the container image or left in logs. Prefer short-lived tokens or in-memory injection.

### 2.7 Automatic Cleanup

- **Requirement:** Finished containers (or Job pods) are removed automatically so they do not accumulate.
- **Implementation:**
  - Kubernetes: `ttlSecondsAfterFinished` on the Job (e.g. 300 seconds).
  - Docker-based: Orchestrator deletes the container as soon as the run completes (or after a short delay for log collection).
- **Checklist:** Automatic cleanup (TTLAfterFinished / equivalent).

---

## 3. Cost and Performance Controls

### 3.1 Max Concurrent Runs per Tenant

- **Requirement:** Define a limit on how many workflow runs can execute concurrently per tenant (e.g. 5 or 10).
- **Implementation:** Control plane checks current running count for the tenant before enqueueing a new run; rejects or queues with back-pressure. Queue consumer (or Kubernetes Job creator) respects this limit when starting new containers.

### 3.2 Global Worker Capacity and Queue Throttling

- **Requirement:** Global cap on concurrent runs (across all tenants) and queue throttling to avoid runaway job creation.
- **Implementation:** Limit the number of Jobs (or runner containers) that can exist at once; use the queue (Redis/BullMQ) to hold excess jobs and process them as capacity frees up. Optionally rate-limit job creation per tenant.

### 3.3 Optional Warm-Pool Strategy

- **Requirement:** Optionally keep a small pool of pre-warmed containers (or Job templates) to reduce cold-start latency.
- **Use case:** When trigger-to-run latency is critical, a few idle runner containers can pick up jobs immediately; new containers are created to refill the pool.
- **Trade-off:** Higher baseline cost vs. lower p95 latency. Can be introduced after MVP if metrics justify it.

### 3.4 Evaluate Hybrid Mode for Ultra-Short Workflows

- **Requirement:** Evaluate whether very short workflows (e.g. single step, &lt; 10 seconds) could run in a shared long-lived worker instead of a dedicated container, to reduce overhead.
- **Trade-off:** Isolation vs. cost/latency. If hybrid mode is used, it must be scoped (e.g. only for trusted tenants or specific workflow tags) and documented. MVP can be container-per-run only.

---

## 4. Deployment Options Summary

| Mode              | Orchestration     | Best for                    |
|-------------------|-------------------|-----------------------------|
| Kubernetes Jobs   | One Job per run   | Production, scale, Coolify |
| Docker Compose    | One container/run | Dev, small single-host     |
| Warm pool (opt.) | Pre-warmed pods   | Low latency requirements   |
| Hybrid (opt.)     | Shared worker     | Ultra-short, trusted flows  |

---

## 5. How This Satisfies Checklist 5

- **Target behaviour:** Isolated container per run; create → run → terminate (all specified).
- **Orchestration:** Kubernetes Jobs preferred; hardened image; resource limits; run-level timeout; network egress (optional); temporary secrets; automatic cleanup (all specified).
- **Cost and performance:** Max concurrent per tenant; global capacity and throttling; optional warm pool; hybrid mode evaluation (all specified).

This completes **5) Workflow Isolation Model (Container per Run)**.
