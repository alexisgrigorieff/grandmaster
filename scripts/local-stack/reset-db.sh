#!/usr/bin/env bash
# Drops and recreates the local test database with Supabase roles, GoTrue's auth
# schema and this project's migrations.
set -euo pipefail
cd "$(dirname "$0")/../.."
export PGOPTIONS="-c client_min_messages=warning"
: "${PGHOST:=127.0.0.1}" "${PGUSER:=postgres}" "${PGPASSWORD:=postgres}" "${AUTH_BIN:=/opt/stack/auth/auth}"
export PGHOST PGUSER PGPASSWORD
DB=${LOCAL_DB:-grandmaster}
psql -d postgres -q -c "drop database if exists $DB with (force)" -c "create database $DB"
psql -d "$DB" -q -v ON_ERROR_STOP=1 -f scripts/local-stack/sql/00-supabase-roles.sql
GOTRUE_DB_DRIVER=postgres \
DATABASE_URL="postgres://supabase_auth_admin:auth_admin@$PGHOST:5432/$DB" \
GOTRUE_DB_MIGRATIONS_PATH="$(dirname "$AUTH_BIN")/migrations" \
API_EXTERNAL_URL=http://localhost:54321/auth/v1 GOTRUE_SITE_URL=http://localhost:3000 \
GOTRUE_JWT_SECRET=local-only-jwt-secret-with-at-least-32-characters \
  "$AUTH_BIN" migrate > /dev/null 2>&1
psql -d "$DB" -q -v ON_ERROR_STOP=1 -f supabase/migrations/20261023000001_init.sql 2>&1 | grep -v -E "NOTICE|wal_level|HINT" || true
psql -d "$DB" -q -v ON_ERROR_STOP=1 -f scripts/local-stack/sql/10-storage-stub.sql
psql -d "$DB" -q -v ON_ERROR_STOP=1 -f supabase/migrations/20261023000002_avatars_storage.sql
psql -d "$DB" -q -v ON_ERROR_STOP=1 -f scripts/local-stack/sql/20-realtime-notify.sql
echo "Database $DB ready."
