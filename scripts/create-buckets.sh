#!/usr/bin/env bash
# =============================================================================
# scripts/create-buckets.sh
# Provisions all Supabase Storage buckets for staybf.
#
# Idempotent: uses PATCH to update an existing bucket rather than failing.
# Run after applying migration 0010 (storage_object_meta table must exist).
#
# Required environment variables:
#   SUPABASE_URL              — https://<ref>.supabase.co
#   SUPABASE_SERVICE_ROLE_KEY — service_role JWT
#
# Optional:
#   DRY_RUN=1   — print curl commands without executing them
#
# Usage:
#   SUPABASE_URL=https://xxx.supabase.co \
#   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
#   ./scripts/create-buckets.sh
#
#   # Or source from .env.staging:
#   set -a; source .env.staging; set +a
#   ./scripts/create-buckets.sh
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Prerequisites
# ---------------------------------------------------------------------------

if [[ -z "${SUPABASE_URL:-}" ]]; then
  echo "ERROR: SUPABASE_URL is not set." >&2
  exit 1
fi
if [[ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  echo "ERROR: SUPABASE_SERVICE_ROLE_KEY is not set." >&2
  exit 1
fi

# Block localhost targets (guard against accidental runs against dev machine)
if echo "${SUPABASE_URL}" | grep -qE 'localhost|127\.0\.0\.1'; then
  echo "ERROR: SUPABASE_URL points to localhost. Refusing to run." >&2
  echo "       Use a real Supabase project URL." >&2
  exit 1
fi

DRY_RUN="${DRY_RUN:-0}"
STORAGE_API="${SUPABASE_URL}/storage/v1/bucket"

echo "=== staybf bucket provisioning ==="
echo "Target: ${SUPABASE_URL}"
echo ""

# ---------------------------------------------------------------------------
# Helper: upsert_bucket
# ---------------------------------------------------------------------------
# Creates bucket if it doesn't exist; updates config if it does.
# Args:
#   $1  bucket id / name
#   $2  public (true|false)
#   $3  file_size_limit in bytes
#   $4  JSON array of allowed MIME types (or null)
# ---------------------------------------------------------------------------
upsert_bucket() {
  local id="$1"
  local public_flag="$2"
  local size_limit="$3"
  local mime_types="$4"

  local body
  body=$(cat <<JSON
{
  "id": "${id}",
  "name": "${id}",
  "public": ${public_flag},
  "file_size_limit": ${size_limit},
  "allowed_mime_types": ${mime_types}
}
JSON
)

  echo -n "  Provisioning '${id}' ... "

  if [[ "${DRY_RUN}" == "1" ]]; then
    echo "(dry-run) POST ${STORAGE_API}"
    echo "  Body: ${body}"
    return
  fi

  # Attempt to create; if 409 (already exists) fall through to update
  local create_response
  local create_status
  create_response=$(curl -s -w "\n%{http_code}" -X POST "${STORAGE_API}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    -d "${body}")
  create_status=$(echo "${create_response}" | tail -n1)
  local create_body
  create_body=$(echo "${create_response}" | head -n-1)

  if [[ "${create_status}" == "200" || "${create_status}" == "201" ]]; then
    echo "created (HTTP ${create_status})"
    return
  fi

  if [[ "${create_status}" == "409" || "${create_status}" == "400" ]]; then
    # Bucket already exists — update it
    local update_body
    update_body=$(cat <<JSON
{
  "public": ${public_flag},
  "file_size_limit": ${size_limit},
  "allowed_mime_types": ${mime_types}
}
JSON
)
    local update_response
    local update_status
    update_response=$(curl -s -w "\n%{http_code}" -X PATCH "${STORAGE_API}/${id}" \
      -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
      -H "Content-Type: application/json" \
      -d "${update_body}")
    update_status=$(echo "${update_response}" | tail -n1)

    if [[ "${update_status}" == "200" || "${update_status}" == "204" ]]; then
      echo "updated (HTTP ${update_status})"
    else
      echo "ERROR: update failed (HTTP ${update_status})" >&2
      echo "  Response: $(echo "${update_response}" | head -n-1)" >&2
      exit 1
    fi
    return
  fi

  echo "ERROR: create failed (HTTP ${create_status})" >&2
  echo "  Response: ${create_body}" >&2
  exit 1
}

# ---------------------------------------------------------------------------
# Bucket definitions
# ---------------------------------------------------------------------------
# Sizes in bytes:
#   2  MB = 2097152
#   5  MB = 5242880
#   10 MB = 10485760
#   20 MB = 20971520
# ---------------------------------------------------------------------------

echo "--- Public buckets (CDN-served, no signed URLs required) ---"

# property-images: host-uploaded property photos served publicly via CDN
upsert_bucket \
  "property-images" \
  "true" \
  "5242880" \
  '["image/jpeg","image/png","image/webp","image/avif"]'

# room-images: host-uploaded room photos served publicly via CDN
upsert_bucket \
  "room-images" \
  "true" \
  "5242880" \
  '["image/jpeg","image/png","image/webp","image/avif"]'

# avatars: user profile pictures served publicly via CDN
upsert_bucket \
  "avatars" \
  "true" \
  "2097152" \
  '["image/jpeg","image/png","image/webp","image/gif"]'

echo ""
echo "--- Private buckets (signed URLs required, TTL enforced server-side) ---"

# message-attachments: images/PDFs/videos sent in thread messages
# TTL: 3 600 s (1 hour) — see src/lib/storage/server.ts
upsert_bucket \
  "message-attachments" \
  "false" \
  "20971520" \
  '["image/jpeg","image/png","image/gif","image/webp","application/pdf","video/mp4","video/webm"]'

# ticket-attachments: screenshots/docs attached to support tickets
# TTL: 86 400 s (24 hours) — see src/lib/storage/server.ts
upsert_bucket \
  "ticket-attachments" \
  "false" \
  "20971520" \
  '["image/jpeg","image/png","image/gif","image/webp","application/pdf"]'

# kyc-documents: government ID / passport scans — highest security tier
# TTL: 900 s (15 minutes) + audit log — see src/lib/storage/server.ts
upsert_bucket \
  "kyc-documents" \
  "false" \
  "10485760" \
  '["image/jpeg","image/png","application/pdf"]'

echo ""
echo "=== Bucket provisioning complete ==="
echo ""
echo "Next steps:"
echo "  1. Verify buckets appear in Supabase Dashboard → Storage"
echo "  2. Confirm RLS policies are active (migration 0010 must be applied)"
echo "  3. Test upload/download flow in staging environment"
echo "  4. Configure ANTIVIRUS_API_URL and ANTIVIRUS_API_KEY in project secrets"
echo "  5. Deploy Edge Functions: virus-scan, image-optimize, storage-purge"
