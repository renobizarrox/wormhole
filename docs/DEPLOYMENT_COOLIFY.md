# Deployment Guide: Coolify

This guide covers deploying the Wormhole SaaS Integration Platform to Coolify at `http://192.168.1.66:8000/`.

---

## Automated deployment (recommended)

A script creates databases, applications, and secrets with no manual input (except one-time config).

**One-time setup:**

1. Copy the example config: `cp .env.coolify.example .env.coolify`
2. Edit `.env.coolify`:
   - `COOLIFY_URL` – your Coolify URL (e.g. `http://192.168.1.66:8000`)
   - `COOLIFY_TOKEN` – API token from Coolify → Keys & Tokens → API tokens
   - `GIT_REPOSITORY` – **public** Git repo URL (e.g. `https://github.com/your-org/wormhole`)
3. Ensure you have **jq** installed: `brew install jq` (macOS) or `apt install jq` (Linux)

**Deploy:**

```bash
./scripts/deploy-coolify.sh
```

The script will:

- Generate secure passwords and keys (JWT_SECRET, ENCRYPTION_KEY, Postgres, Redis)
- Create PostgreSQL and Redis in Coolify (if API supports it)
- Create the API and Web applications from your Git repo (Dockerfile build)
- Set all environment variables on the API and Web services
- Trigger the first deployment
- Save generated secrets to `.env.coolify.generated` (do not commit)

After the run, configure Coolify proxy so `/api` routes to **wormhole-api** and `/` to **wormhole-web**, then open your Coolify URL and register the first tenant.

---

## Manual deployment

---

## Prerequisites

- Coolify instance running and accessible
- Git repository accessible to Coolify (or Docker registry configured)
- PostgreSQL, MongoDB, and Redis instances (Coolify-managed or external)

---

## Services Overview

Deploy these services on Coolify:

1. **PostgreSQL** – Primary database (Coolify database service or external)
2. **MongoDB** – Execution logs (Coolify database service or external)
3. **Redis** – Queue and caching (Coolify database service or external)
4. **API** – Node.js control plane (Fastify)
5. **Web** – Nuxt 3 frontend (SSR or static)

**Note:** Hasura GraphQL Engine is optional for MVP (Node API handles REST endpoints). Python runner can be added later.

---

## Step 1: Database Services

### PostgreSQL

1. In Coolify, create a **PostgreSQL** database service.
2. Note the connection string (e.g. `postgresql://user:password@postgres:5432/wormhole`).
3. Save as `DATABASE_URL` for the API service.

### MongoDB

1. Create a **MongoDB** database service.
2. Note the connection string (e.g. `mongodb://mongodb:27017/wormhole_logs`).
3. Save for future use (execution logs).

### Redis

1. Create a **Redis** service.
2. Note the connection URL (e.g. `redis://redis:6379`).
3. Save as `REDIS_URL` for the API service.

---

## Step 2: Deploy API Service

### Create New Resource

1. In Coolify, create a **New Resource** → **Docker Compose** or **Dockerfile**.
2. **Name:** `wormhole-api`
3. **Source:** Git repository (or Docker registry)

### Configuration

**Build Method:** Dockerfile  
**Dockerfile Path:** `api/Dockerfile`  
**Build Context:** Root of repository

**Ports:**
- Container: `3000`
- Public: Map to `/api` or a subdomain (e.g. `api.wormhole.local`)

**Environment Variables:**

```env
NODE_ENV=production
DATABASE_URL=postgresql://user:password@postgres:5432/wormhole
JWT_SECRET=<generate-64-char-random-string>
JWT_ISSUER=wormhole-api
JWT_EXPIRES_IN=7d
HOST=0.0.0.0
PORT=3000
REDIS_URL=redis://redis:6379
ENCRYPTION_KEY=<generate-64-char-hex-string>
```

**Generate secrets:**

```bash
# JWT_SECRET (min 32 chars, use 64+ for production)
openssl rand -hex 32

# ENCRYPTION_KEY (must be 64 hex chars)
openssl rand -hex 32
```

**Health Check:** `/health` (configured in Dockerfile)

**Deploy:** Build and deploy. The Dockerfile runs `prisma migrate deploy` on startup.

---

## Step 3: Deploy Web Service

### Create New Resource

1. Create a **New Resource** → **Dockerfile**.
2. **Name:** `wormhole-web`
3. **Source:** Same Git repository

### Configuration

**Build Method:** Dockerfile  
**Dockerfile Path:** `web/Dockerfile`  
**Build Context:** Root of repository

**Ports:**
- Container: `3000`
- Public: Map to `/` (root) or a subdomain (e.g. `wormhole.local`)

**Environment Variables:**

```env
NODE_ENV=production
API_BASE_URL=http://192.168.1.66:8000/api
GRAPHQL_ENDPOINT=http://192.168.1.66:8000/graphql
HASURA_ADMIN_SECRET=<if-using-hasura>
```

**Note:** Adjust `API_BASE_URL` to match your API service URL (Coolify path or subdomain).

**Health Check:** `/` (configured in Dockerfile)

**Deploy:** Build and deploy.

---

## Step 4: Networking and Paths

### Option A: Path-based routing

- Web: `http://192.168.1.66:8000/`
- API: `http://192.168.1.66:8000/api`

Configure Coolify reverse proxy to route:
- `/api/*` → API service
- `/*` → Web service

### Option B: Subdomain routing

- Web: `http://wormhole.local:8000/` (or `http://192.168.1.66:8000/`)
- API: `http://api.wormhole.local:8000/` (or `http://192.168.1.66:8000/api`)

Update `API_BASE_URL` in web service to match.

---

## Step 5: Verify Deployment

1. **API health:** `curl http://192.168.1.66:8000/api/health`
   - Should return: `{"status":"ok","timestamp":"..."}`

2. **Web:** Open `http://192.168.1.66:8000/` in browser
   - Should show login page or redirect to login

3. **Database:** Check API logs for Prisma migration success
   - Should see: "Prisma migrations applied"

4. **Queue:** If `REDIS_URL` is set, check API logs for "Queue worker started"

---

## Step 6: Initial Setup

1. **Register first tenant:**
   - Use `POST /api/auth/register` or create via API directly
   - Example:
     ```bash
     curl -X POST http://192.168.1.66:8000/api/auth/register \
       -H "Content-Type: application/json" \
       -d '{
         "email": "admin@example.com",
         "password": "secure-password",
         "tenantName": "My Company",
         "tenantSlug": "my-company"
       }'
     ```

2. **Login and test:**
   - Use web UI or `POST /api/auth/login`
   - Create an app, action, connection, and workflow

---

## Troubleshooting

### API fails to start

- Check `DATABASE_URL` is correct and PostgreSQL is accessible
- Check `JWT_SECRET` is set (min 32 chars)
- Check `ENCRYPTION_KEY` is set (64 hex chars) in production
- Check logs: `docker logs <api-container>`

### Web can't reach API

- Verify `API_BASE_URL` matches the API service URL
- Check CORS if API and web are on different origins
- Check Coolify networking/routing configuration

### Database migrations fail

- Ensure `DATABASE_URL` has correct permissions
- Check PostgreSQL logs
- Manually run migrations: `docker exec <api-container> npx prisma migrate deploy`

### Queue not processing

- Verify `REDIS_URL` is set and Redis is accessible
- Check API logs for "Queue worker started"
- Check Redis connection: `docker exec <redis-container> redis-cli ping`

---

## Environment-Specific Configuration

### Staging vs Production

- Use separate Coolify projects or separate databases
- Use different `JWT_SECRET` and `ENCRYPTION_KEY` per environment
- Set `NODE_ENV=production` in production

### Secrets Management

- Store secrets in Coolify's environment variables (encrypted)
- Never commit `.env` files
- Rotate `JWT_SECRET` and `ENCRYPTION_KEY` periodically

---

## Scaling

- **API:** Scale horizontally (multiple replicas) behind Coolify load balancer
- **Web:** Scale horizontally (Nuxt SSR supports multiple instances)
- **Queue workers:** The API includes an in-process worker; scale API replicas to increase worker capacity
- **Database:** Use connection pooling; consider read replicas for PostgreSQL

---

## Monitoring

- Use Coolify's built-in metrics and logs
- Set up alerts for:
  - API health check failures
  - High error rates
  - Queue depth
  - Database connection issues

See `docs/OBSERVABILITY.md` for details.

---

## Next Steps

- Add Hasura GraphQL Engine (optional)
- Add Python runner service (when needed)
- Set up CI/CD to auto-deploy on git push
- Configure backups for PostgreSQL and MongoDB
- Set up monitoring dashboards (Prometheus/Grafana or Coolify)
