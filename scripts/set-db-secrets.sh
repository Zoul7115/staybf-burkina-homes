#!/usr/bin/env bash
# =============================================================================
# scripts/set-db-secrets.sh
# Sets database-level configuration used by SECURITY DEFINER functions that
# call the Supabase Storage / notification REST APIs via pg_net.
#
# These settings are read inside PL/pgSQL functions with:
#   current_setting('app.supabase_url')
#   current_setting('app.service_role_key')
#
# Usage:
#   SUPABASE_DB_URL="postgresql://..." \
#   SUPABASE_URL="https://..." \
#   SUPABASE_SERVICE_ROLE_KEY="eyJ..." \
#   bash scripts/set-db-secrets.sh
#
# The script is idempotent — safe to re-run on every deploy.
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Validate required environment variables
# ---------------------------------------------------------------------------

: "${SUPABASE_DB_URL:?SUPABASE_DB_URL is required}"
: "${SUPABASE_URL:?SUPABASE_URL is required}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY is required}"

# ---------------------------------------------------------------------------
# Safety checks
# ---------------------------------------------------------------------------

if [[ "$SUPABASE_URL" == *"localhost"* ]] || [[ "$SUPABASE_URL" == *"127.0.0.1"* ]]; then
  echo "ℹ️  Local Supabase detected — skipping db secrets (use supabase start instead)."
  exit 0
fi

if [[ "$SUPABASE_SERVICE_ROLE_KEY" == "PLACEHOLDER_REPLACE_BEFORE_MIGRATION" ]]; then
  echo "❌  SUPABASE_SERVICE_ROLE_KEY contains placeholder value. Aborting."
  exit 1
fi

if [[ "$SUPABASE_URL" == "PLACEHOLDER_REPLACE_BEFORE_MIGRATION" ]]; then
  echo "❌  SUPABASE_URL contains placeholder value. Aborting."
  exit 1
fi

# ---------------------------------------------------------------------------
# Apply settings
# ---------------------------------------------------------------------------

echo "🔑  Setting database-level Supabase secrets..."

psql "$SUPABASE_DB_URL" --no-password -q <<SQL
ALTER DATABASE postgres SET app.supabase_url TO '${SUPABASE_URL}';
ALTER DATABASE postgres SET app.service_role_key TO '${SUPABASE_SERVICE_ROLE_KEY}';
SQL

echo "✅  app.supabase_url and app.service_role_key set successfully."
echo "    (Changes take effect on the next new database connection.)"
