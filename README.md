# Wormhole – SaaS Integration Platform

iPaaS-style platform: **Apps** (connectors), **Actions** (endpoints), **Workflows** (triggers + steps), with execution in isolated containers.

**Stack:** Nuxt.js, Vuetify.js, **Hasura GraphQL**, PostgreSQL, **MongoDB**. **Deployment:** Coolify at `http://192.168.1.66:8000/`.

## Repository structure

| Path | Stack | Purpose |
|------|--------|---------|
| `api/` | Node.js (TypeScript), Hasura GraphQL | Control plane: Hasura GraphQL + custom Actions, auth, tenants, RBAC, apps/actions/workflows CRUD, orchestration |
| `runner/` | Python | Execution plane: run workflow steps, call external APIs, report state/logs (writes logs to MongoDB) |
| `web/` | Nuxt 3 + Vuetify.js | Frontend: dashboard, app/action/workflow builders, runs and logs (Hasura GraphQL client) |

## Prerequisites

- Node.js 20+
- Python 3.11+
- pnpm 8+
- Docker & Docker Compose (local DB, Redis, MongoDB)
- PostgreSQL 15+ (transactional data, exposed via Hasura GraphQL)
- MongoDB 7+ (execution logs)
- Hasura GraphQL Engine
- Redis 7+

## Quick start (local)

```bash
# Copy env and start backing services
cp api/.env.example api/.env
docker compose up -d

# API
cd api && pnpm install && pnpm prisma migrate dev && pnpm dev

# Web (separate terminal)
cd web && pnpm install && pnpm dev

# Runner (when needed)
cd runner && uv sync && uv run python -m runner.main
```

## Documentation

- [Master checklist & specs](./SAAS_INTEGRATION_PLATFORM_CHECKLIST.md)
- [Architecture & storage (PostgreSQL + MongoDB)](./docs/ARCHITECTURE_STORAGE.md)
- [API conventions](./docs/CONVENTIONS.md)
- [Contributing](./docs/CONTRIBUTING.md)

## License

Proprietary.
