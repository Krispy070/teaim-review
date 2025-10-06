#!/usr/bin/env bash
set -euo pipefail
APP="${APP:-http://127.0.0.1:5000}"
PROJ="${PROJ:?set PROJ=<project_uuid>}"
USER="${USER_ID:?set USER_ID=<user_uuid>}"
ORG="${ORG_ID:?set ORG_ID=<org_uuid>}"
EMAIL="${EMAIL:-you@example.com}"

h() { echo -e "\n--- $* ---"; }

h "Seed sample docs"
curl -fsS -X POST "$APP/api/dev/seed-simple?project_id=$PROJ" \
  -H "X-Dev-User: $USER" -H "X-Dev-Org: $ORG" -H "X-Dev-Role: owner" >/dev/null

h "Smoke-run (stage + external sign link)"
SMOKE=$(curl -fsS -X POST "$APP/api/dev/smoke-run?project_id=$PROJ" \
  -H "Content-Type: application/json" \
  -H "X-Dev-User: $USER" -H "X-Dev-Org: $ORG" -H "X-Dev-Role: owner" \
  -d "{\"email_to\":\"$EMAIL\"}")
echo "$SMOKE" | jq -r '.token_link // "no-token"'

h "Digest preview (counts)"
curl -fsS "$APP/api/digest/preview?project_id=$PROJ" \
  -H "X-Dev-User: $USER" -H "X-Dev-Org: $ORG" -H "X-Dev-Role: pm" | jq