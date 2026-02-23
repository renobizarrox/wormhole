# Part 4.3 – Execution Plane (Python workers/runners)

This document describes the **execution plane**: the Python runtime that runs workflow steps, invokes external APIs (Actions), and reports state and logs back to the control plane.

---

## 1. Overview

The execution plane is responsible for:

- Consuming **workflow run jobs** from the queue (Redis/BullMQ).
- Loading **WorkflowVersion** (graph, parameterSchema, envConfig) and **Action** definitions.
- Resolving **Connection** credentials (decrypted by control plane or via secure handoff).
- Executing each **step** in order (linear in MVP; branching later).
- For each step: building the HTTP request from Action metadata, applying auth, invoking the external API.
- **Retry/backoff/timeout** per step (using Action defaults).
- **Reporting** step/run status and **writing execution logs** to MongoDB.
- Optionally running inside an **isolated container** per run (see section 5).

---

## 2. Python Execution Runtime for Actions/Workflows

### 2.1 Runtime Model

- **Worker process**: Long-running Python process(es) that:
  - Poll or subscribe to a queue (e.g. Redis/BullMQ) for jobs of type `workflow_run`.
  - Each job payload contains: `workflowRunId`, `workflowVersionId`, `tenantId`, `input` (runtime parameters).
- **Execution context**:
  - Fetch workflow definition (graph, parameterSchema, envConfig) from control plane (GraphQL or direct DB).
  - Fetch Connection credentials for steps that need them (via control plane API; never store raw secrets in runner).
  - Resolve env vars and secret refs from `envConfig`.
- **Step execution loop**:
  - Traverse graph (MVP: linear list of steps).
  - For each step node: resolve Action, Connection, input mapping.
  - Run the action (HTTP call), then update StepRun status and optionally write logs to MongoDB.
  - On failure: apply retry policy; after max attempts, mark step as FAILED and optionally fail the run or skip.

### 2.2 Technology Stack

- **Python 3.11+**.
- **Async preferred**: `asyncio` + `httpx` for non-blocking HTTP.
- **Pydantic** for config and payload validation.
- **JSON Schema** validation for action inputs/outputs (using `jsonschema` or similar).
- **MongoDB driver** (e.g. `motor` for async or `pymongo`) for writing execution logs.
- **Queue client**: Redis/BullMQ (e.g. `arq` or `celery` for async workers, or a simple Redis list + consumer).

---

## 3. Action Invocation Engine (HTTP + Auth Adapters)

### 3.1 Request Building

- For each **Action**:
  - **Method**: `Action.method` (GET/POST/PUT/PATCH/DELETE).
  - **URL**: Resolve `Action.endpointTemplate` with path params from step input (using `pathSchema`).
  - **Query string**: Build from step input using `Action.querySchema`.
  - **Headers**: Merge `Action.headersTemplate` with auth headers from Connection.
  - **Body**: Build from step input using `Action.bodySchema` (for POST/PUT/PATCH).
- **Base URL**: Comes from Connection config or App settings (e.g. `config.baseUrl`).

### 3.2 Auth Adapters

- **API_KEY**: Add header or query param (key name from App/Connection config).
- **BASIC**: Base64-encode `username:password` from Connection secrets.
- **OAUTH2**: Use access token from Connection; refresh if expired using refresh token (call token endpoint).
- **CUSTOM_HEADER**: Add header(s) from Connection secrets (e.g. `Authorization: Bearer <token>`).

Credentials are **injected at runtime** (e.g. control plane passes decrypted secrets in the job payload or the runner fetches them via a secure API that returns decrypted secrets for the run scope only). Never persist raw secrets in the runner.

---

## 4. Transformation and Mapping Layer

- **Input mapping**: Step input may be:
  - Literal values from the workflow graph.
  - Outputs from previous steps (e.g. `steps.step1.output.body.id`).
  - Runtime parameters (from `WorkflowRun.input`).
- **Expression/template engine**: Simple variable substitution (e.g. `{{ input.customerId }}`, `{{ steps.fetch_order.output.id }}`) to fill path/query/body.
- **Output extraction**: Optional JSON path or schema-based extraction from response for use in later steps.
- MVP can use a minimal template syntax; phase 2 can add a full expression language.

---

## 5. Retry/Backoff/Timeout Engine

- **Per-step retry** (from Action):
  - `retryStrategy`: NONE | FIXED | EXPONENTIAL.
  - `maxAttempts`, `initialDelayMs`, `maxDelayMs`.
- **Behavior**:
  - On HTTP error or timeout: wait (fixed or exponential backoff), then retry.
  - After `maxAttempts` exhausted: set StepRun status to FAILED, write error to StepRun and logs.
- **Timeout**:
  - `Action.timeoutMs`: applied to each HTTP request.
  - Optional workflow-level timeout: abort run if total time exceeds limit.
- **Idempotency**: If the action supports idempotency keys, the runner can pass one (e.g. from run id + step key) to avoid duplicate side effects on retries.

---

## 6. Step-by-Step State Reporting Back to Control Plane

- **StepRun updates**:
  - QUEUED → RUNNING (when step starts).
  - RUNNING → SUCCESS (with output payload) or FAILED (with errorCode, errorMessage).
  - Optionally SKIPPED/CANCELED.
- **WorkflowRun updates**:
  - QUEUED → RUNNING (when first step starts).
  - RUNNING → SUCCESS (when all steps succeed) or FAILED/CANCELED (on failure or cancellation).
- **Mechanism**:
  - Runner calls control plane API (Hasura Action or dedicated HTTP endpoint) to update `workflow_runs` and `step_runs` in PostgreSQL.
  - Or: runner writes to a queue, and a small Node/worker updates DB from queue messages (decoupling).
- **Execution logs**:
  - Each log line (level, message, context) is written to **MongoDB** (collection `execution_logs`) with `tenantId`, `workflowRunId`, `stepRunId`, `timestamp`.
  - No secrets in logs; truncate large payloads in context.

---

## 7. Project Structure (Scaffold)

```
runner/
├── pyproject.toml
├── README.md
├── src/
│   └── runner/
│       __init__.py
│       main.py           # Entrypoint, queue consumer
│       config.py         # Pydantic settings
│       execution/
│         engine.py       # Workflow execution loop
│         step_runner.py  # Single step execution
│       actions/
│         http_client.py  # HTTP invocation
│         auth_adapters.py # API_KEY, BASIC, OAUTH2, CUSTOM_HEADER
│       mapping/
│         template.py     # Variable substitution, output extraction
│       retry.py          # Retry/backoff logic
│       reporting.py      # Update run/step status, write MongoDB logs
```

---

## 8. How This Satisfies Checklist 4.3

- **Python execution runtime for actions/workflows**: Single runtime that consumes run jobs, loads workflow definition, and executes steps in order.
- **Action invocation engine (HTTP + auth adapters)**: Request building from Action metadata; auth adapters for API_KEY, BASIC, OAUTH2, CUSTOM_HEADER.
- **Transformation and mapping layer**: Input/output mapping and simple templating for path/query/body and step-to-step data passing.
- **Retry/backoff/timeout engine**: Per-action retry strategy and timeouts; optional workflow-level timeout.
- **Step-by-step state reporting**: Updates to WorkflowRun/StepRun in PostgreSQL; execution logs to MongoDB.

This completes the **execution plane** design for section **4.3**. Implementation can follow this structure inside the `runner/` package.
