# Runbook: High Error Rate or Queue Backup

## Symptoms

- API returns 5xx or high latency
- Workflow runs stuck in QUEUED
- Alerts: error rate above threshold, queue depth high, or latency breach

## Checks (in order)

### 1. API and health

- `GET /health` on the Node API. If 5xx or timeout, the API process may be down or overloaded.
- **Action:** Restart the API service (Coolify or your orchestrator). Check logs for OOM or uncaught exceptions.

### 2. Queue (Redis / BullMQ)

- If Redis is down or unreachable, jobs cannot be enqueued or processed; runs stay QUEUED.
- **Action:** Verify Redis is up and reachable from the API and workers. Restart Redis if needed; after restart, workers will reconnect and process existing jobs.
- Check queue depth (e.g. BullMQ dashboard or Redis `LLEN` for the queue key). If depth grows without being consumed, workers may be down or failing.

### 3. Workers

- The Node API runs an in-process BullMQ worker when `REDIS_URL` is set. If the API is running but the worker is not processing jobs, check:
  - Logs for "Queue worker started" and for job failures (e.g. "Workflow run job failed").
  - Step failures (e.g. connection timeouts, action errors) cause job retries; after max attempts the job fails and the run is marked FAILED.
- **Action:** Restart the API to restart the worker. If failures are due to external services or bad workflow config, fix the workflow or connections and re-run.

### 4. Database (PostgreSQL)

- Connection exhaustion or long-running queries can block the API and workers.
- **Action:** Check DB connection count and slow queries. Restart API to reset pool if needed. Consider increasing pool size or tuning long-running queries.

### 5. Rollback

- If a recent deploy caused the issue: redeploy the previous app version (and optionally restore DB from backup if a migration caused data/correctness issues). See DB migration rollback in Part 9.

## Prevention

- Set alerts on error rate, queue depth, and latency (Part 9).
- Run load tests (e.g. `k6 run scripts/load/health.js`) before releases to establish baselines.
