#!/usr/bin/env bash
# Starts a local, Supabase-compatible backend for automated end-to-end tests:
#   Postgres (system install) + GoTrue + PostgREST + realtime-lite + storage-lite
#   + mail catcher, behind a gateway on http://localhost:54321.
# Requires: PostgreSQL 16, the GoTrue binary (AUTH_BIN) and PostgREST (PGRST_BIN).
# For day-to-day development use the Supabase CLI (`supabase start`) instead.
set -euo pipefail
cd "$(dirname "$0")/../.."
STACK_DIR=${STACK_DIR:-/tmp/grandmaster-stack}
mkdir -p "$STACK_DIR"
export JWT_SECRET=${JWT_SECRET:-local-only-jwt-secret-with-at-least-32-characters}
export LOCAL_DB=${LOCAL_DB:-grandmaster}
export PGHOST=127.0.0.1 PGUSER=postgres PGPASSWORD=${PGPASSWORD:-postgres}
AUTH_BIN=${AUTH_BIN:-/opt/stack/auth/auth}
PGRST_BIN=${PGRST_BIN:-/opt/stack/postgrest}
export DATABASE_URL="postgres://postgres:$PGPASSWORD@127.0.0.1:5432/$LOCAL_DB"

./scripts/local-stack/stop.sh >/dev/null 2>&1 || true
[ "${KEEP_DB:-0}" = "1" ] || AUTH_BIN=$AUTH_BIN ./scripts/local-stack/reset-db.sh

eval "$(node scripts/local-stack/keys.mjs)"
echo "$ANON_KEY" > "$STACK_DIR/anon.key"
echo "$SERVICE_ROLE_KEY" > "$STACK_DIR/service.key"

GOTRUE_API_HOST=127.0.0.1 PORT=9999 API_EXTERNAL_URL=http://localhost:54321 \
GOTRUE_MAILER_URLPATHS_INVITE=/auth/v1/verify GOTRUE_MAILER_URLPATHS_CONFIRMATION=/auth/v1/verify GOTRUE_MAILER_URLPATHS_RECOVERY=/auth/v1/verify GOTRUE_MAILER_URLPATHS_EMAIL_CHANGE=/auth/v1/verify \
GOTRUE_DB_DRIVER=postgres DATABASE_URL="postgres://supabase_auth_admin:auth_admin@127.0.0.1:5432/$LOCAL_DB" \
GOTRUE_SITE_URL=${SITE_URL:-http://localhost:3000} GOTRUE_URI_ALLOW_LIST="${SITE_URL:-http://localhost:3000}/**" \
GOTRUE_JWT_SECRET=$JWT_SECRET GOTRUE_JWT_EXP=3600 GOTRUE_JWT_AUD=authenticated GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated GOTRUE_JWT_ADMIN_ROLES=service_role \
GOTRUE_EXTERNAL_EMAIL_ENABLED=true GOTRUE_MAILER_AUTOCONFIRM=${AUTOCONFIRM:-true} GOTRUE_DISABLE_SIGNUP=false \
GOTRUE_SMTP_HOST=127.0.0.1 GOTRUE_SMTP_PORT=2500 GOTRUE_SMTP_ADMIN_EMAIL=noreply@grandmaster.local GOTRUE_SMTP_SENDER_NAME=Grandmaster GOTRUE_SMTP_MAX_FREQUENCY=1s \
GOTRUE_RATE_LIMIT_EMAIL_SENT=1000 GOTRUE_RATE_LIMIT_VERIFY=1000 GOTRUE_RATE_LIMIT_TOKEN_REFRESH=1000 GOTRUE_RATE_LIMIT_SIGN_IN_SIGN_UPS=10000 \
GOTRUE_DB_MIGRATIONS_PATH="$(dirname "$AUTH_BIN")/migrations" GOTRUE_LOG_LEVEL=warn \
  nohup "$AUTH_BIN" serve > "$STACK_DIR/auth.log" 2>&1 &
echo $! > "$STACK_DIR/auth.pid"

PGRST_DB_URI="postgres://authenticator:authenticator@127.0.0.1:5432/$LOCAL_DB" PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE=anon \
PGRST_JWT_SECRET=$JWT_SECRET PGRST_SERVER_PORT=3001 PGRST_SERVER_HOST=127.0.0.1 PGRST_DB_POOL=20 \
  nohup "$PGRST_BIN" > "$STACK_DIR/rest.log" 2>&1 &
echo $! > "$STACK_DIR/rest.pid"

nohup node scripts/local-stack/realtime-lite.mjs > "$STACK_DIR/realtime.log" 2>&1 & echo $! > "$STACK_DIR/realtime.pid"
nohup node scripts/local-stack/storage-lite.mjs > "$STACK_DIR/storage.log" 2>&1 & echo $! > "$STACK_DIR/storage.pid"
nohup node scripts/local-stack/mailcatcher.mjs > "$STACK_DIR/mail.log" 2>&1 & echo $! > "$STACK_DIR/mail.pid"
nohup node scripts/local-stack/gateway.mjs > "$STACK_DIR/gateway.log" 2>&1 & echo $! > "$STACK_DIR/gateway.pid"

for i in $(seq 1 40); do
  if curl -sf http://127.0.0.1:54321/auth/v1/health >/dev/null && curl -sf -o /dev/null http://127.0.0.1:54321/rest/v1/ -H "apikey: $ANON_KEY"; then
    cat > .env.test.local <<ENV
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
NEXT_PUBLIC_SITE_URL=${SITE_URL:-http://localhost:3000}
ENV
    echo "Local stack ready on http://localhost:54321 (env written to .env.test.local)"
    exit 0
  fi
  sleep 0.5
done
echo "Stack failed to start; logs in $STACK_DIR" >&2
tail -n 20 "$STACK_DIR"/*.log >&2
exit 1
