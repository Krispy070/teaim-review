#!/usr/bin/env bash
set -euo pipefail
APP="${APP:?set APP=https://api.yourapp.com}"
PROJ="${PROJ:?}"
TOKEN="${TOKEN:?set TOKEN=<INTERNAL_API_BEARER or real JWT>}"

curl_auth(){ curl -fsS -H "Authorization: Bearer $TOKEN" "$@"; }

echo "Seed…"
curl_auth -X POST "$APP/api/dev/seed-simple?project_id=$PROJ" -H "Content-Type: application/json" >/dev/null

echo "Smoke-run…"
curl_auth -X POST "$APP/api/dev/smoke-run?project_id=$PROJ" -H "Content-Type: application/json" -d '{"email_to":null}' | jq

echo "Digest preview…"
curl_auth "$APP/api/digest/preview?project_id=$PROJ" | jq