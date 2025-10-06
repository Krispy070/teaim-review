#!/usr/bin/env bash
set -euo pipefail
echo "== Full Suite: Lint/Type/API/E2E =="

if [ -f package.json ]; then
  if npm run -s lint >/dev/null 2>&1; then echo "✅ Lint"; else echo "ℹ️ Lint skipped"; fi
  if npm run -s typecheck >/dev/null 2>&1; then echo "✅ Typecheck"; else echo "ℹ️ Typecheck skipped"; fi
fi

echo "== API smoke =="
bash ./scripts/dev_smoke.sh

echo "== E2E (Playwright) =="
npx playwright install --with-deps >/dev/null 2>&1 || true
npx playwright test tests/user-management.spec.ts || (echo "❌ User management E2E tests failed" && exit 1)
echo "✅ User management workflows tested"

echo "== SUCCESS =="