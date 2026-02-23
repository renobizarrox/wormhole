# Quick Deployment Checklist for Coolify

Follow this checklist to deploy Wormhole to Coolify.

## Pre-deployment

- [ ] Generate secrets: `./scripts/generate-secrets.sh`
- [ ] Note the `JWT_SECRET` and `ENCRYPTION_KEY` values
- [ ] Ensure Coolify has access to your Git repository (or Docker registry)

## Database Services (Create First)

- [ ] **PostgreSQL**: Create database service in Coolify
  - Note connection string → `DATABASE_URL`
- [ ] **MongoDB**: Create database service (optional for MVP)
  - Note connection string (for future execution logs)
- [ ] **Redis**: Create Redis service
  - Note connection URL → `REDIS_URL`

## Deploy API Service

- [ ] Create new resource: **Dockerfile**
- [ ] Name: `wormhole-api`
- [ ] Source: Git repo (or Docker registry)
- [ ] Dockerfile path: `api/Dockerfile`
- [ ] Build context: Repository root
- [ ] Port: `3000` (map to `/api` or subdomain)
- [ ] Environment variables:
  - [ ] `NODE_ENV=production`
  - [ ] `DATABASE_URL=<from-postgres-service>`
  - [ ] `JWT_SECRET=<generated-secret>`
  - [ ] `JWT_ISSUER=wormhole-api`
  - [ ] `JWT_EXPIRES_IN=7d`
  - [ ] `HOST=0.0.0.0`
  - [ ] `PORT=3000`
  - [ ] `REDIS_URL=<from-redis-service>`
  - [ ] `ENCRYPTION_KEY=<generated-64-hex-chars>`
- [ ] Health check: `/health`
- [ ] Deploy and verify logs show "Prisma migrations applied" and "Queue worker started"

## Deploy Web Service

- [ ] Create new resource: **Dockerfile**
- [ ] Name: `wormhole-web`
- [ ] Source: Same Git repo
- [ ] Dockerfile path: `web/Dockerfile`
- [ ] Build context: Repository root
- [ ] Port: `3000` (map to `/` or root)
- [ ] Environment variables:
  - [ ] `NODE_ENV=production`
  - [ ] `API_BASE_URL=http://192.168.1.66:8000/api` (adjust to your API URL)
  - [ ] `GRAPHQL_ENDPOINT=<if-using-hasura>` (optional)
  - [ ] `HASURA_ADMIN_SECRET=<if-using-hasura>` (optional)
- [ ] Health check: `/`
- [ ] Deploy and verify web loads

## Verify Deployment

- [ ] API health: `curl http://192.168.1.66:8000/api/health` → `{"status":"ok",...}`
- [ ] Web loads: Open `http://192.168.1.66:8000/` → Login page
- [ ] Register first tenant via API or web UI
- [ ] Login and create test app/action/connection/workflow

## Post-deployment

- [ ] Set up monitoring/alerts (Coolify or external)
- [ ] Configure backups for PostgreSQL
- [ ] Document your deployment URLs and secrets (securely)
- [ ] Test end-to-end workflow: create app → action → connection → workflow → run

## Troubleshooting

See `docs/DEPLOYMENT_COOLIFY.md` for detailed troubleshooting.

**Common issues:**
- API fails: Check `DATABASE_URL`, `JWT_SECRET`, `ENCRYPTION_KEY`
- Web can't reach API: Check `API_BASE_URL` matches API service URL
- Migrations fail: Check database permissions and connection string
