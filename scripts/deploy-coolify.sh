#!/usr/bin/env bash
#
# Deploy Wormhole to Coolify automatically.
# Generates all secrets (passwords, JWT, ENCRYPTION_KEY) and creates:
#   - PostgreSQL, Redis, API application, Web application
#
# One-time setup: create a file .env.coolify in repo root with:
#   COOLIFY_URL=http://192.168.1.66:8000
#   COOLIFY_TOKEN=<your API token from Coolify Keys & Tokens>
#   GIT_REPOSITORY=https://github.com/your-org/wormhole   (public repo URL)
# Optional: SERVER_UUID=, PROJECT_UUID=, ENVIRONMENT_NAME=production
#   (if not set, script uses first server and first project)
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if ! command -v jq &>/dev/null; then
  echo "ERROR: jq is required. Install with: brew install jq (macOS) or apt install jq (Linux)"
  exit 1
fi
if ! command -v openssl &>/dev/null; then
  echo "ERROR: openssl is required for generating secrets."
  exit 1
fi

# Load config
if [[ -f .env.coolify ]]; then
  set -a
  source .env.coolify
  set +a
fi

COOLIFY_URL="${COOLIFY_URL:-http://192.168.1.66:8000}"
COOLIFY_API="${COOLIFY_URL}/api/v1"
COOLIFY_TOKEN="${COOLIFY_TOKEN:-}"
GIT_REPOSITORY="${GIT_REPOSITORY:-}"
GIT_BRANCH="${GIT_BRANCH:-main}"
SERVER_UUID="${SERVER_UUID:-}"
PROJECT_UUID="${PROJECT_UUID:-}"
ENVIRONMENT_NAME="${ENVIRONMENT_NAME:-production}"

if [[ -z "$COOLIFY_TOKEN" ]]; then
  echo "ERROR: COOLIFY_TOKEN is required. Set it in .env.coolify or environment."
  echo "Create a token in Coolify: Keys & Tokens -> API tokens"
  exit 1
fi

if [[ -z "$GIT_REPOSITORY" ]]; then
  echo "ERROR: GIT_REPOSITORY is required. Set it in .env.coolify (e.g. https://github.com/your-org/wormhole)"
  exit 1
fi

AUTH_HEADER="Authorization: Bearer $COOLIFY_TOKEN"

# Generate secure secrets (no user input)
generate_secret() { openssl rand -hex 32; }
JWT_SECRET=$(generate_secret)
ENCRYPTION_KEY=$(openssl rand -hex 32)
POSTGRES_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)
REDIS_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)
POSTGRES_USER="wormhole"
POSTGRES_DB="wormhole"

echo "Generated secrets (saved to .env.coolify.generated for reference)."

# Resolve server and project UUIDs if not set
if [[ -z "$SERVER_UUID" ]] || [[ -z "$PROJECT_UUID" ]]; then
  echo "Fetching Coolify servers and projects..."
  SERVERS_JSON=$(curl -s -H "$AUTH_HEADER" "${COOLIFY_API}/servers") || true
  PROJECTS_JSON=$(curl -s -H "$AUTH_HEADER" "${COOLIFY_API}/projects") || true
  if [[ -z "$SERVER_UUID" ]] && [[ -n "$SERVERS_JSON" ]]; then
    SERVER_UUID=$(echo "$SERVERS_JSON" | jq -r 'if type == "array" then .[0].uuid else .uuid end // empty')
  fi
  if [[ -z "$PROJECT_UUID" ]] && [[ -n "$PROJECTS_JSON" ]]; then
    PROJECT_UUID=$(echo "$PROJECTS_JSON" | jq -r 'if type == "array" then .[0].uuid else .uuid end // empty')
  fi
fi

if [[ -z "$SERVER_UUID" ]]; then
  echo "ERROR: Could not get SERVER_UUID. Set it in .env.coolify or ensure Coolify has at least one server."
  exit 1
fi

if [[ -z "$PROJECT_UUID" ]]; then
  echo "ERROR: Could not get PROJECT_UUID. Set it in .env.coolify or ensure Coolify has at least one project."
  exit 1
fi

echo "Using server: $SERVER_UUID, project: $PROJECT_UUID"

# 1) Create PostgreSQL
echo "Creating PostgreSQL database..."
PG_RESP=$(curl -s -X POST "${COOLIFY_API}/databases/postgresql" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d "{
    \"server_uuid\": \"$SERVER_UUID\",
    \"project_uuid\": \"$PROJECT_UUID\",
    \"environment_name\": \"$ENVIRONMENT_NAME\",
    \"postgres_user\": \"$POSTGRES_USER\",
    \"postgres_password\": \"$POSTGRES_PASSWORD\",
    \"postgres_db\": \"$POSTGRES_DB\",
    \"name\": \"wormhole-postgres\",
    \"instant_deploy\": true
  }") || true

PG_UUID=$(echo "$PG_RESP" | jq -r '.uuid // .data.uuid // empty')
if [[ -z "$PG_UUID" ]]; then
  echo "WARNING: PostgreSQL creation response: $PG_RESP"
  echo "You may need to create PostgreSQL manually in Coolify and set DATABASE_URL in API env."
  DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@wormhole-postgres:5432/${POSTGRES_DB}"
else
  echo "PostgreSQL created: $PG_UUID"
  # Coolify internal hostname is often the resource UUID or container name
  DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${PG_UUID}:5432/${POSTGRES_DB}"
fi

# 2) Create Redis
echo "Creating Redis..."
REDIS_RESP=$(curl -s -X POST "${COOLIFY_API}/databases/redis" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d "{
    \"server_uuid\": \"$SERVER_UUID\",
    \"project_uuid\": \"$PROJECT_UUID\",
    \"environment_name\": \"$ENVIRONMENT_NAME\",
    \"redis_password\": \"$REDIS_PASSWORD\",
    \"name\": \"wormhole-redis\",
    \"instant_deploy\": true
  }") || true

REDIS_UUID=$(echo "$REDIS_RESP" | jq -r '.uuid // .data.uuid // empty')
if [[ -z "$REDIS_UUID" ]]; then
  echo "WARNING: Redis creation response: $REDIS_RESP"
  REDIS_URL="redis://:${REDIS_PASSWORD}@wormhole-redis:6379"
else
  echo "Redis created: $REDIS_UUID"
  REDIS_URL="redis://:${REDIS_PASSWORD}@${REDIS_UUID}:6379"
fi

# 3) Create API application (Dockerfile)
echo "Creating API application..."
API_RESP=$(curl -s -X POST "${COOLIFY_API}/applications/public" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d "{
    \"server_uuid\": \"$SERVER_UUID\",
    \"project_uuid\": \"$PROJECT_UUID\",
    \"environment_name\": \"$ENVIRONMENT_NAME\",
    \"git_repository\": \"$GIT_REPOSITORY\",
    \"git_branch\": \"$GIT_BRANCH\",
    \"build_pack\": \"dockerfile\",
    \"dockerfile_location\": \"api/Dockerfile\",
    \"base_directory\": \"/\",
    \"name\": \"wormhole-api\",
    \"ports_exposes\": \"3000\",
    \"health_check_enabled\": true,
    \"health_check_path\": \"/health\",
    \"health_check_port\": \"3000\",
    \"instant_deploy\": false
  }") || true

API_UUID=$(echo "$API_RESP" | jq -r '.uuid // .data.uuid // empty')
if [[ -z "$API_UUID" ]]; then
  echo "ERROR: Failed to create API application. Response: $API_RESP"
  exit 1
fi
echo "API application created: $API_UUID"

# Set API environment variables
echo "Setting API environment variables..."
curl -s -X PATCH "${COOLIFY_API}/applications/${API_UUID}/envs/bulk" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -d "{
    \"data\": [
      {\"key\": \"NODE_ENV\", \"value\": \"production\"},
      {\"key\": \"DATABASE_URL\", \"value\": \"$DATABASE_URL\"},
      {\"key\": \"JWT_SECRET\", \"value\": \"$JWT_SECRET\"},
      {\"key\": \"JWT_ISSUER\", \"value\": \"wormhole-api\"},
      {\"key\": \"JWT_EXPIRES_IN\", \"value\": \"7d\"},
      {\"key\": \"HOST\", \"value\": \"0.0.0.0\"},
      {\"key\": \"PORT\", \"value\": \"3000\"},
      {\"key\": \"REDIS_URL\", \"value\": \"$REDIS_URL\"},
      {\"key\": \"ENCRYPTION_KEY\", \"value\": \"$ENCRYPTION_KEY\"}
    ]
  }" > /dev/null || true

# 4) Create Web application
echo "Creating Web application..."
WEB_RESP=$(curl -s -X POST "${COOLIFY_API}/applications/public" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d "{
    \"server_uuid\": \"$SERVER_UUID\",
    \"project_uuid\": \"$PROJECT_UUID\",
    \"environment_name\": \"$ENVIRONMENT_NAME\",
    \"git_repository\": \"$GIT_REPOSITORY\",
    \"git_branch\": \"$GIT_BRANCH\",
    \"build_pack\": \"dockerfile\",
    \"dockerfile_location\": \"web/Dockerfile\",
    \"base_directory\": \"/\",
    \"name\": \"wormhole-web\",
    \"ports_exposes\": \"3000\",
    \"health_check_enabled\": true,
    \"health_check_path\": \"/\",
    \"health_check_port\": \"3000\",
    \"instant_deploy\": false
  }") || true

WEB_UUID=$(echo "$WEB_RESP" | jq -r '.uuid // .data.uuid // empty')
if [[ -z "$WEB_UUID" ]]; then
  echo "ERROR: Failed to create Web application. Response: $WEB_RESP"
  exit 1
fi
echo "Web application created: $WEB_UUID"

# API_BASE_URL: frontend must call API; use Coolify base + /api (configure proxy so /api -> wormhole-api)
API_PUBLIC_URL="${COOLIFY_URL}/api"
echo "Setting Web environment variables (API_BASE_URL=$API_PUBLIC_URL)..."
curl -s -X PATCH "${COOLIFY_API}/applications/${WEB_UUID}/envs/bulk" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -d "{
    \"data\": [
      {\"key\": \"NODE_ENV\", \"value\": \"production\"},
      {\"key\": \"API_BASE_URL\", \"value\": \"$API_PUBLIC_URL\"}
    ]
  }" > /dev/null || true

# 5) Trigger deploys
echo "Triggering deployments..."
curl -s -X GET "${COOLIFY_API}/deploy?uuid=${API_UUID}&force=false" -H "$AUTH_HEADER" > /dev/null || true
curl -s -X GET "${COOLIFY_API}/deploy?uuid=${WEB_UUID}&force=false" -H "$AUTH_HEADER" > /dev/null || true

# Save generated secrets for reference (do not commit)
cat > .env.coolify.generated << EOF
# Generated by scripts/deploy-coolify.sh - DO NOT COMMIT
# Use these to configure custom domains or reconnect to DBs
POSTGRES_USER=$POSTGRES_USER
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
POSTGRES_DB=$POSTGRES_DB
DATABASE_URL=$DATABASE_URL
REDIS_PASSWORD=$REDIS_PASSWORD
REDIS_URL=$REDIS_URL
JWT_SECRET=$JWT_SECRET
ENCRYPTION_KEY=$ENCRYPTION_KEY
API_UUID=$API_UUID
WEB_UUID=$WEB_UUID
PG_UUID=$PG_UUID
REDIS_UUID=$REDIS_UUID
EOF
chmod 600 .env.coolify.generated 2>/dev/null || true

echo ""
echo "=== Deployment initiated ==="
echo "Coolify dashboard: $COOLIFY_URL"
echo "API UUID: $API_UUID"
echo "Web UUID: $WEB_UUID"
echo "Secrets saved to .env.coolify.generated (do not commit)."
echo ""
echo "Next: In Coolify, add a proxy so path /api points to wormhole-api and / to wormhole-web."
echo "Then open $COOLIFY_URL and register your first tenant."
