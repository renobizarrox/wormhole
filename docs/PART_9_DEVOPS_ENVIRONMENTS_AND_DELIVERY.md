# Part 9 – DevOps, Environments, and Delivery

This document specifies **DevOps, environments, and delivery** (section 9 of the main checklist) for the SaaS Integration Platform. It defines the deployment target, local and staging/production environments, infrastructure as code, CI/CD, and observability.

**Reference:** [ARCHITECTURE_STORAGE.md](./ARCHITECTURE_STORAGE.md); [PART_3_NON_FUNCTIONAL_REQUIREMENTS.md](./PART_3_NON_FUNCTIONAL_REQUIREMENTS.md); existing `docker-compose.yml` (PostgreSQL, Redis, MongoDB).

---

## 1. Deployment Target (Mandatory)

- **Platform:** All services must be deployed to **Coolify**.
- **Base URL:** `http://192.168.1.66:8000/`
- **Services to deploy on Coolify:**
  - **Frontend (web):** Nuxt 3 app; served as static or Node SSR; reachable at base URL (e.g. `/` or `/app`).
  - **GraphQL API:** Hasura GraphQL Engine; exposed at a path such as `/graphql` or a dedicated subdomain/host.
  - **Node API:** Control plane (auth REST, Hasura Actions backend, webhook intake); same host or subdomain (e.g. `/api`, `/webhooks`).
  - **Workers:** Queue consumers (Node and/or Python) that process workflow jobs from Redis/BullMQ.
  - **Python runner:** Execution plane; may run as a separate service or as worker processes that start containerized runs (e.g. Kubernetes Jobs or Docker).
  - **PostgreSQL:** Primary database (Coolify-managed container or external).
  - **MongoDB:** Execution logs (Coolify-managed container or external).
  - **Redis:** Queues and caching (Coolify-managed container or external).

Coolify manages build, deploy, and (optionally) networking so that the frontend, API, and workers are available at the configured base URL and paths.

---

## 2. Environments

### 2.1 Local Development

- **Purpose:** Developers run the app stack on their machine for feature work and debugging.
- **Backing services:** Provided by **Docker Compose** (current `docker-compose.yml`):
  - PostgreSQL 15 (port 5432, user/db: wormhole)
  - Redis 7 (port 6379)
  - MongoDB 7 (port 27017, db: wormhole_logs)
- **Application services:** Run natively (not in Docker) for fast iteration:
  - API: `cd api && pnpm install && pnpm prisma migrate dev && pnpm dev`
  - Web: `cd web && pnpm install && pnpm dev`
  - Runner: `cd runner && uv sync && uv run python -m runner.main`
- **Optional:** A second Compose file or override (e.g. `docker-compose.dev.yml`) can add Hasura, Node, and web as containers for “full stack in Docker” if desired; MVP doc assumes native run for app code.
- **Env:** Each service uses `.env` (from `.env.example`); DB and Redis URLs point to `localhost` and Compose-exposed ports.

### 2.2 Staging / Production

- **Target:** Coolify server.
- **Base URL:** `http://192.168.1.66:8000/` (staging and production can share this host with different paths or subdomains, or use separate Coolify projects).
- **Data:** Staging and production should use separate databases (PostgreSQL, MongoDB) and Redis instances (or separate DBs/prefixes) to avoid mixing data.
- **Secrets:** All secrets (DB passwords, JWT secret, encryption keys, API keys) are managed via Coolify secrets or environment config, never committed.

---

## 3. Infrastructure as Code

### 3.1 Coolify-Compatible Config

- **Docker Compose:** Used for local backing services; can be extended or duplicated for Coolify if Coolify is configured to use Compose for deployment.
- **Dockerfiles:** Each deployable service should have a **Dockerfile** (or use Coolify build packs):
  - **api:** Dockerfile in `api/` – Node 20, install deps, Prisma generate, run Node server.
  - **web:** Dockerfile in `web/` – Node 20, build Nuxt (static or SSR), serve (e.g. Node or nginx).
  - **runner:** Dockerfile in `runner/` – Python 3.11, install deps, run worker/runner process.
  - **hasura:** Use official Hasura image; config via env and metadata (YAML/JSON) in repo (e.g. `hasura/` or `api/hasura/`).
- **Build packs:** If Coolify supports build packs (e.g. Nixpacks), they can be used instead of Dockerfiles as long as the resulting image runs the same commands and exposes the same ports.

### 3.2 Terraform or Coolify-Native Config

- **Networking, DB, Redis:** If PostgreSQL, MongoDB, or Redis are **not** fully managed by Coolify (e.g. external cloud instances), define them in Terraform or Coolify-native config so that:
  - Networks and firewall rules are versioned.
  - Connection strings and endpoints are injectable via Coolify env/secrets.
- **MVP:** If Coolify manages all containers (including Postgres, MongoDB, Redis as stack services), Terraform may be optional; document the chosen approach (Coolify-only vs Terraform for infra).

---

## 4. CI/CD

### 4.1 Lint, Type Checks, Tests for All Services

- **Node API (`api/`):** `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test` (unit/integration as defined).
- **Web (`web/`):** `pnpm lint`, `pnpm exec nuxi typecheck` (or equivalent), `pnpm test` (unit/component/e2e as defined).
- **Runner (`runner/`):** Lint (e.g. ruff), type check (e.g. pyright), `pytest` or equivalent.
- **Hasura:** Metadata lint/validate (e.g. `hasura metadata apply --dry-run` or validate in CI).
- **Pipeline:** Single pipeline (e.g. GitHub Actions, GitLab CI) runs these for the monorepo; failures block merge and deploy.

### 4.2 Build Immutable Docker Images

- **Build:** On merge to main (or release tag), build Docker images for `api`, `web`, `runner`, and optionally Hasura (if custom image).
- **Tagging:** Use commit SHA or semantic version (e.g. `api:abc1234`, `web:v1.2.3`) so every deploy uses a unique, immutable image.
- **Registry:** Push to a registry accessible by Coolify (Docker Hub, GHCR, GitLab Registry, or Coolify’s built-in registry).

### 4.3 Security Scans

- **SAST:** Static analysis (e.g. ESLint security rules, Semgrep, CodeQL) on code.
- **Container:** Image scanning (e.g. Trivy, Snyk) on built Docker images for CVEs.
- **Dependency:** `pnpm audit`, `npm audit`, `uv pip audit` (or similar) in CI; optionally fail on high/critical or only report.

### 4.4 Deploy Pipeline to Coolify

- **Trigger:** On push to main (or manual) the pipeline deploys to Coolify:
  - Either Coolify pulls from Git and builds (Coolify-native flow),
  - Or CI builds images, pushes to registry, and triggers Coolify to pull the new image and redeploy (webhook or API).
- **Result:** Frontend, API, Hasura, workers, and runner (as configured) are updated at `http://192.168.1.66:8000/`.

### 4.5 DB Migration Pipeline (PostgreSQL) with Rollback Strategy

- **Migrations:** Prisma migrations in `api/prisma/migrations/`; applied as part of deploy or a dedicated migration job.
- **Apply:** Before or during deploy: `prisma migrate deploy` (production DB URL from secrets). Ensure only one process runs migrations (e.g. single migration job or init container).
- **Rollback strategy:**
  - **Documented:** Keep a rollback runbook: how to revert to previous app version and, if needed, previous DB schema.
  - **Prisma:** Prisma does not auto-generate “down” migrations; rollback is either:
    - Revert application to previous version and run a manual or scripted “down” migration if one exists, or
    - Restore DB from backup and redeploy previous app version.
  - **Practice:** Prefer additive migrations; avoid destructive changes in a single step when possible so rollback is “redeploy previous app + optional backup restore.”

---

## 5. Observability and Ops

### 5.1 Dashboards for API, Queue, Runner, DB Metrics

- **API (Node/Hasura):** Request rate, latency (p50/p95/p99), error rate, by route or operation.
- **Queue (Redis/BullMQ):** Queue depth, job completion rate, failed jobs, delay.
- **Runner:** Runs started/completed/failed per period, step duration, container start time.
- **DB:** PostgreSQL: connections, query latency, replication lag if applicable. MongoDB: ops, connection count, disk.
- **Tooling:** Use Coolify’s built-in metrics, or export to Prometheus/Grafana (or similar) and build dashboards there.

### 5.2 Alerts for Failures, Saturation, Latency

- **Failures:** Alert when error rate or failed job rate exceeds threshold; alert on repeated migration or deploy failures.
- **Saturation:** Alert when queue depth exceeds limit, DB connections near max, or disk usage above threshold.
- **Latency:** Alert when p95 latency for API or critical workflows exceeds SLA (e.g. 5 s trigger-to-start).
- **Channels:** Alerts go to email, Slack, or PagerDuty as configured in Coolify or the monitoring stack.

### 5.3 Centralized Log Aggregation and Retention Policies

- **Aggregation:** All service logs (API, Hasura, runner, workers) shipped to a central store (e.g. Loki, Elasticsearch, or Coolify log aggregation) so they can be searched by service, tenant, run id, and time.
- **Retention:** Define retention (e.g. 30 days for execution logs, 90 days for audit logs); enforce via TTL in MongoDB for execution logs and via log pipeline or storage policy for aggregated logs.

### 5.4 Incident Response Runbooks

- **Document:** Runbooks for common incidents, for example:
  - High error rate on API or workflows: check queue depth, runner health, DB connectivity; scale or restart workers.
  - Queue backing up: increase workers, check runner failures, check Redis.
  - DB connection exhaustion: check connection pool settings, long-running queries, restart app if needed.
  - Failed migrations: rollback steps (redeploy previous version, restore backup if necessary).
- **Location:** Store in `docs/runbooks/` or the wiki; link from alerts so on-call can follow steps.

---

## 6. Summary: Checklist 9 Compliance

| Checklist item | Specification |
|----------------|---------------|
| Deployment target (Coolify at base URL) | All services (frontend, GraphQL, Node API, workers, runner, Postgres, MongoDB, Redis) deployed to Coolify at `http://192.168.1.66:8000/`. |
| Local development with Docker Compose | Backing services (Postgres, Redis, MongoDB) via existing `docker-compose.yml`; app services run natively; optional full-stack Compose for app containers. |
| Staging/production on Coolify | Staging and production on Coolify server; base URL as above; separate DB/Redis for staging vs production. |
| Coolify-compatible config | Dockerfiles (or build packs) for api, web, runner, Hasura; Compose for local and optionally for Coolify stack. |
| Terraform or Coolify-native for networking/DB/Redis | Documented: use Terraform or Coolify-native config when DB/Redis are external; optional if Coolify manages all. |
| Lint, type checks, tests for all services | CI runs lint, typecheck, and tests for api, web, runner (and Hasura metadata validate). |
| Build immutable Docker images | CI builds and tags images by SHA or version; push to registry for Coolify. |
| Security scans (SAST, container, dependency) | SAST in CI; container image scan; dependency audit (pnpm/uv); fail or warn on critical. |
| Deploy pipeline to Coolify | CI triggers Coolify deploy (git push or image webhook) so changes land at base URL. |
| DB migration pipeline with rollback strategy | Prisma migrate deploy in pipeline; rollback documented (redeploy previous app + backup restore if needed). |
| Dashboards (API, queue, runner, DB) | Dashboards for request/latency/errors, queue depth, runner runs, DB metrics (Coolify or Prometheus/Grafana). |
| Alerts (failures, saturation, latency) | Alerts on error rate, queue saturation, latency breach, and critical failures. |
| Centralized log aggregation and retention | Logs shipped to central store; retention policy (e.g. 30–90 days) defined and enforced. |
| Incident response runbooks | Runbooks for high error rate, queue backup, DB issues, failed migrations; stored and linked from alerts. |

This completes **9) DevOps, Environments, and Delivery** checklist.
