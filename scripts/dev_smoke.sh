#!/usr/bin/env bash
set -euo pipefail

echo "🔥 Dev Smoke Test - API Health Check"

BASE_URL="http://localhost:5000"

# Test basic health endpoint
echo "Testing health endpoint..."
curl -f -s "$BASE_URL/api/" > /dev/null && echo "✅ API Health OK" || (echo "❌ API Health FAILED" && exit 1)

# Test auth endpoints (expect 401/403, not 500)
echo "Testing auth endpoints..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/auth/request_reset?email=test@example.com" -X POST || echo "000")
if [[ "$STATUS" =~ ^(200|401|403)$ ]]; then
  echo "✅ Auth endpoint responding properly"
else
  echo "❌ Auth endpoint returned $STATUS (expected 200/401/403)"
  exit 1
fi

# Test user management endpoints (should not 500)
echo "Testing user management..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/users/list" || echo "000")
if [[ "$STATUS" =~ ^(200|401|403|404)$ ]]; then
  echo "✅ User management endpoints responding"
else
  echo "❌ User management returned $STATUS"
  exit 1
fi

echo "🎉 Smoke test PASSED - Core API endpoints are functional"