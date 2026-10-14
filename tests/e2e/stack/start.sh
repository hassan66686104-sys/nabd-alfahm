#!/usr/bin/env bash
# يشغّل بيئة شبيهة بـ Supabase محليًا لاختبارات المتصفح (Postgres + GoTrue + PostgREST + بوابة).
# المتطلبات: PostgreSQL 15+ يعمل، وملفا GoTrue (auth) و PostgREST التنفيذيان (انظر tests/e2e/README.md).
set -euo pipefail
cd "$(dirname "$0")/../../.."
PGURL=${PGURL:-postgres://postgres@localhost:54329}
DB=${E2E_DB:-nabd_e2e}
BIN=${STACK_BIN:-/tmp/claude-0/bin}
SECRET=$(node -e "import('./tests/e2e/stack/jwt.mjs').then(m=>console.log(m.JWT_SECRET))")
psql "$PGURL/postgres" -q -c "drop database if exists $DB with (force)" -c "create database $DB"
psql "$PGURL/$DB" -q -v ON_ERROR_STOP=1 -f tests/db/supabase-shim.sql
HOSTPORT=${PGURL#postgres://postgres@}
export GOTRUE_DB_DRIVER=postgres
export DATABASE_URL="postgres://supabase_auth_admin:authadmin@$HOSTPORT/$DB?search_path=auth&sslmode=disable"
export GOTRUE_DB_MIGRATIONS_PATH="$BIN/migrations"
export GOTRUE_JWT_SECRET="$SECRET" GOTRUE_JWT_EXP=3600 GOTRUE_JWT_AUD=authenticated GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated GOTRUE_JWT_ADMIN_ROLES=service_role
export API_EXTERNAL_URL=http://localhost:54321/auth/v1 GOTRUE_SITE_URL=http://localhost:4173 GOTRUE_URI_ALLOW_LIST="http://localhost:4173/**"
export GOTRUE_MAILER_AUTOCONFIRM=true GOTRUE_EXTERNAL_EMAIL_ENABLED=true GOTRUE_DISABLE_SIGNUP=false
export GOTRUE_API_HOST=127.0.0.1 PORT=9999 GOTRUE_RATE_LIMIT_EMAIL_SENT=1000 GOTRUE_LOG_LEVEL=warn
"$BIN/auth" migrate
for f in supabase/migrations/*.sql; do psql "$PGURL/$DB" -q -v ON_ERROR_STOP=1 -f "$f"; done
psql "$PGURL/$DB" -q -c "notify pgrst, 'reload schema'"
mkdir -p /tmp/claude-0/stack-logs
nohup "$BIN/auth" serve > /tmp/claude-0/stack-logs/gotrue.log 2>&1 &
PGRST_DB_URI="postgres://authenticator:authpass@$HOSTPORT/$DB" PGRST_DB_SCHEMAS=public PGRST_DB_ANON_ROLE=anon \
  PGRST_JWT_SECRET="$SECRET" PGRST_SERVER_PORT=3000 PGRST_DB_POOL=20 \
  nohup "$BIN/postgrest" > /tmp/claude-0/stack-logs/postgrest.log 2>&1 &
nohup node tests/e2e/stack/gateway.mjs > /tmp/claude-0/stack-logs/gateway.log 2>&1 &
sleep 2
echo "stack up: http://localhost:54321  anon key: $(node tests/e2e/stack/jwt.mjs anon)"
