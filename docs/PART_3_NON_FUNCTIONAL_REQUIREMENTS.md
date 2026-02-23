# Part 3 – Non-Functional Requirements

This document specifies the **non-functional requirements** (security, reliability, performance, observability, compliance) for the SaaS Integration Platform.

---

## 1. Security

### 1.1 TLS Everywhere
- **Requirement:** All network communication must use TLS 1.2+ (HTTPS, WSS, secure DB connections).
- **Implementation:**
  - Frontend (Nuxt) → Hasura GraphQL: HTTPS.
  - Hasura → PostgreSQL: SSL/TLS connection.
  - Python runner → External APIs: HTTPS enforced.
  - Webhook endpoints: HTTPS only.

### 1.2 Encryption at Rest
- **Requirement:** Sensitive data encrypted at rest in databases and storage.
- **Implementation:**
  - PostgreSQL: Database-level encryption (managed service or disk encryption).
  - MongoDB: Encryption at rest enabled.
  - Connection secrets (`Connection.secretCipher`): Encrypted using KMS/Vault before storage.

### 1.3 Secrets Never Stored in Plaintext
- **Requirement:** No secrets (passwords, API keys, tokens) stored in plaintext anywhere.
- **Implementation:**
  - `Connection.secretCipher`: Encrypted blob (KMS/Vault).
  - `Trigger.webhookSecretCipher`: Encrypted blob.
  - Environment variables: Managed via Coolify secrets (encrypted).
  - Application logs: Never log secrets (masked or excluded).

### 1.4 Least Privilege IAM
- **Requirement:** Services and users have minimum required permissions.
- **Implementation:**
  - Database users: Read/write only to required schemas/tables.
  - Hasura roles: Tenant-scoped permissions (users can only access their tenant's data).
  - Service accounts: Minimal permissions for their function.

### 1.5 Webhook Signature Verification
- **Requirement:** All incoming webhooks must be verified via signature.
- **Implementation:**
  - HMAC signature verification using `Trigger.webhookSecretCipher`.
  - Constant-time comparison to prevent timing attacks.
  - Reject unsigned or invalid signatures (401/403).

### 1.6 Rate Limiting
- **Requirement:** Rate limiting per tenant/user/API token to prevent abuse.
- **Implementation:**
  - Hasura: Rate limiting middleware (per tenant/user).
  - Webhook endpoints: Rate limiting per IP/tenant.
  - Python runner: Rate limiting per external API call (configurable per Action).

### 1.7 Input Sanitization and Output Encoding
- **Requirement:** All user inputs sanitized; outputs properly encoded.
- **Implementation:**
  - GraphQL input validation (Hasura + custom validators).
  - SQL injection prevention (Prisma parameterized queries).
  - XSS prevention (Nuxt/Vuetify auto-escaping).
  - JSON Schema validation for Action inputs/outputs.

### 1.8 Dependency Vulnerability Scanning
- **Requirement:** Regular scanning and patching of dependencies.
- **Implementation:**
  - CI/CD pipeline: Automated dependency scanning (npm audit, pip-audit, etc.).
  - Monthly security updates.
  - Critical vulnerabilities patched within 24-48 hours.

---

## 2. Reliability

### 2.1 Durable Queue
- **Requirement:** Job/event queue must be durable (survive service restarts).
- **Implementation:**
  - Redis/BullMQ or RabbitMQ with persistence enabled.
  - Queue messages persisted to disk.
  - Replication for high availability.

### 2.2 At-Least-Once Processing with Dedupe/Idempotency
- **Requirement:** Workflow runs processed at least once; duplicates prevented.
- **Implementation:**
  - `WorkflowRun.idempotencyKey` for deduplication.
  - Idempotent operations (check for existing run before creating).
  - Idempotency keys enforced at trigger level (webhook, manual, cron).

### 2.3 Dead-Letter Queue
- **Requirement:** Failed jobs moved to DLQ for manual inspection/replay.
- **Implementation:**
  - Failed workflow runs (after max retries) → DLQ.
  - DLQ entries include error details, run context, retry count.
  - Manual replay capability from DLQ.

### 2.4 Automatic Retries with Bounded Limits
- **Requirement:** Automatic retries with exponential backoff, bounded by max attempts.
- **Implementation:**
  - `Action.retryStrategy`, `maxAttempts`, `initialDelayMs`, `maxDelayMs`.
  - `StepRun.attempt` tracks retry count.
  - Stop retrying after `maxAttempts` reached.

### 2.5 Graceful Degradation and Backpressure
- **Requirement:** System degrades gracefully under load; backpressure prevents overload.
- **Implementation:**
  - Queue depth monitoring → throttle new runs if queue too deep.
  - Circuit breakers for external API calls (fail fast if external service down).
  - Rate limiting prevents overload.
  - Health checks → mark services unhealthy if overloaded.

---

## 3. Performance

### 3.1 API Response Targets
- **Requirement:**
  - p95 read operations: < 300ms.
  - p95 write operations: < 500ms.
- **Implementation:**
  - Hasura GraphQL: Optimized queries (indexes, query analysis).
  - Database indexes on frequently queried fields.
  - Connection pooling (PostgreSQL, MongoDB).
  - Caching for read-heavy operations (Redis).

### 3.2 Trigger to Runner Start Latency
- **Requirement:** p95 latency from trigger event to runner start < 5 seconds.
- **Implementation:**
  - Fast queue processing (Redis/BullMQ).
  - Pre-warmed runner containers (optional warm pool).
  - Efficient job scheduling.

### 3.3 Horizontal Scaling
- **Requirement:** API and runners must scale horizontally.
- **Implementation:**
  - Hasura: Multiple instances behind load balancer.
  - Python runners: Stateless workers, scale based on queue depth.
  - Coolify auto-scaling based on CPU/memory/queue metrics.

---

## 4. Observability

### 4.1 Centralized Logs
- **Requirement:** All logs centralized and searchable.
- **Implementation:**
  - **Execution logs:** MongoDB (high volume, fast queries).
  - **Application logs:** Centralized logging service (Loki, ELK, or cloud logging).
  - Log aggregation from all services (Hasura, Node.js, Python runner).

### 4.2 Metrics
- **Requirement:** Key metrics tracked (queue depth, run duration, error rates).
- **Implementation:**
  - Prometheus metrics:
    - Queue depth (active/pending jobs).
    - Workflow run duration (p50, p95, p99).
    - Error rates (by tenant, workflow, action).
    - API latency (Hasura GraphQL).
  - Grafana dashboards for visualization.

### 4.3 Distributed Tracing
- **Requirement:** End-to-end tracing across API/orchestrator/runner.
- **Implementation:**
  - OpenTelemetry instrumentation.
  - Trace IDs propagated through:
    - GraphQL requests (Hasura → Node.js Actions).
    - Workflow runs (API → Queue → Runner).
    - External API calls (Runner → External systems).
  - Jaeger or Tempo for trace storage/querying.

### 4.4 Alerting
- **Requirement:** Alerts for SLO/SLA threshold violations.
- **Implementation:**
  - Alert rules:
    - API p95 latency > threshold.
    - Error rate > threshold.
    - Queue depth > threshold.
    - Workflow run failure rate > threshold.
  - Alerting via PagerDuty, Slack, email.

### 4.5 Log Retention Policy
- **Requirement:** Log retention policy with automatic cleanup.
- **Implementation:**
  - MongoDB: TTL indexes on `execution_logs.timestamp` (e.g., 30 days retention).
  - Application logs: Retention policy in logging service (e.g., 90 days).
  - Audit logs: Longer retention (e.g., 1 year) for compliance.

---

## 5. Compliance Readiness

### 5.1 Data Retention Policy
- **Requirement:** Defined retention policies for all data types.
- **Implementation:**
  - Execution logs: 30 days (MongoDB TTL).
  - Workflow runs: 90 days (PostgreSQL, soft delete or archival).
  - Audit events: 1 year (PostgreSQL).
  - User data: Per GDPR/CCPA requirements.

### 5.2 Audit Trails
- **Requirement:** Immutable audit trail of all critical actions.
- **Implementation:**
  - `AuditEvent` table (PostgreSQL) for:
    - User actions (create/update/delete Apps, Actions, Workflows, Connections).
    - Invitations sent/accepted.
    - Workflow runs triggered/canceled.
  - Audit events immutable (no updates/deletes).

### 5.3 Access History
- **Requirement:** Track who accessed what data and when.
- **Implementation:**
  - Log all GraphQL queries/mutations (Hasura query logging).
  - Track API token usage (who/what/when).
  - Access logs stored in audit system.

### 5.4 Basic SOC2-Readiness Controls
- **Requirement:** Technical and process controls for SOC2 readiness.
- **Implementation:**
  - **Access controls:** RBAC, tenant isolation, least privilege.
  - **Encryption:** TLS in transit, encryption at rest.
  - **Monitoring:** Logging, metrics, alerting.
  - **Change management:** Version control, code reviews, deployment process.
  - **Incident response:** Runbooks, escalation procedures.

---

## 6. How This Satisfies Checklist Section 3

- **Security:** All 8 items covered (TLS, encryption, secrets, IAM, webhooks, rate limiting, sanitization, scanning).
- **Reliability:** All 5 items covered (durable queue, idempotency, DLQ, retries, degradation).
- **Performance:** All 3 items covered (API targets, trigger latency, horizontal scaling).
- **Observability:** All 5 items covered (centralized logs, metrics, tracing, alerting, retention).
- **Compliance:** All 4 items covered (retention, audit trails, access history, SOC2 controls).

This completes the **non-functional requirements** specification for the platform.
