# Observability (Hardening)

Short reference for monitoring, alerts, and operations. Full spec: [PART_9_DEVOPS_ENVIRONMENTS_AND_DELIVERY.md](./PART_9_DEVOPS_ENVIRONMENTS_AND_DELIVERY.md).

## Health and readiness

- **Node API:** `GET /health` returns `{ status: 'ok', timestamp: ISO }`. Use for liveness and readiness probes (e.g. Coolify, Kubernetes).
- No auth required. Does not check DB or Redis; for deeper readiness you can add a separate `/ready` that pings DB (and optionally Redis) if needed.

## Metrics to expose or collect

| Area   | What to measure |
|--------|------------------|
| API    | Request rate, latency (p50/p95/p99), error rate by route |
| Queue  | BullMQ: queue depth, job completion rate, failed jobs |
| Runner | Runs started/completed/failed per period; step duration |
| DB     | PostgreSQL: connections, query latency; MongoDB if used for logs |

Use Coolify built-in metrics, or export to Prometheus/Grafana and build dashboards (Part 9).

## Alerts (recommended)

- **Failures:** Error rate or failed-job rate above threshold.
- **Saturation:** Queue depth above limit; DB connections near max; disk usage high.
- **Latency:** p95 API or trigger-to-start above SLA (e.g. 5 s).

Channels: email, Slack, or PagerDuty as configured in your stack.

## Load testing

- **Script:** `scripts/load/health.js` (k6). Run: `k6 run scripts/load/health.js`. Optionally set `BASE_URL` for staging.
- **Goal:** Establish baseline throughput and latency; run before releases or when tuning (Part 10).

## Runbooks

- [High error rate or queue backup](./runbooks/high-error-rate-or-queue-backup.md): steps to diagnose and mitigate API/queue/worker/DB issues and when to rollback.

Store additional runbooks in `docs/runbooks/` and link from alerts.
