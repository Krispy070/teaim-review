#!/bin/bash

# ---- CONFIG ----
ORG="d915376c-2bd7-4e79-b9c9-aab9d7fcb5a8"
PROJ="dced0b98-87b4-46ff-b2a4-2cf8e627e8d2"
BASE="http://localhost:5000/api"

echo "1) DIAG DB"
curl -s "$BASE/diag/db" | jq .

echo "2) DIAG STORAGE"
curl -s "$BASE/diag/storage" | jq .

echo "3) INGEST-SYNC (inline indexing)"
echo "Payroll retro rules and SIT exit criteria." > /tmp/teaim-sync.txt
curl -s -X POST "$BASE/ingest-sync" \
  -F "org_id=$ORG" \
  -F "project_id=$PROJ" \
  -F "file=@/tmp/teaim-sync.txt" | jq .

echo "4) INDEX STATS"
curl -s "$BASE/diag/index-stats?org_id=$ORG&project_id=$PROJ" | jq .

echo "5) LIBRARY (should list the doc)"
curl -s "$BASE/artifacts?org_id=$ORG&project_id=$PROJ&limit=10" | jq .

echo "6) ASK (should include Sources)"
curl -s -X POST "$BASE/ask" \
  -H "Content-Type: application/json" \
  -d "{\"org_id\":\"$ORG\",\"project_id\":\"$PROJ\",\"question\":\"Summarize the latest document and list any exit criteria.\",\"k\":3}" \
  | jq .