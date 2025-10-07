#!/usr/bin/env bash
set -euo pipefail
REPO_OWNER="Krispy070"
REPO_NAME="teaim-review"
REPO_URL="https://github.com/${REPO_OWNER}/${REPO_NAME}.git"

# Require token supplied via env (set in Replit Secrets or export per run)
: "${GITHUB_TOKEN:?Set GITHUB_TOKEN in env before running}"

# Use tokenized URL for this push only
git remote set-url origin "https://${REPO_OWNER}:${GITHUB_TOKEN}@github.com/${REPO_OWNER}/${REPO_NAME}.git" || true

# Make or switch to review-clean (orphan = no history drag)
git checkout review-clean 2>/dev/null || git checkout --orphan review-clean

# Remove everything from the index (keeps files on disk)
git rm -r --cached . 2>/dev/null || true

# Tight .gitignore (no secrets/builds/replit internals/large assets)
cat > .gitignore <<'EOF'
# secrets
.env
.env.*
*.pem
*.key
*.p12

# deps/build/caches
node_modules/
dist/
build/
coverage/
.next/
.out/
.vercel/
.turbo/
.cache/

# replit internals
.local/
.config/
.replit/
*.bin

# attachments & test output
attached_assets/
test-results/

# artifacts
*.log
*.map
*.zip
*.tar*
*.pdf
*.png
*.jpg
*.jpeg
*.webp
*.mp4
*.mov

# os/vcs
.DS_Store
Thumbs.db
EOF

# Stage ONLY source + configs (adjust paths if your layout differs)
git add server client/src 2>/dev/null || true
git add package.json package-lock.json pnpm-lock.yaml yarn.lock 2>/dev/null || true
git add tsconfig.json playwright.config.* vite.config.* next.config.* 2>/dev/null || true
git add .gitignore README.md 2>/dev/null || true

# Guard against secrets
if git ls-files | grep -Ei '(^|/)\.env(\.|$)'; then
  echo "⛔ .env detected in index. Remove before pushing."; exit 1
fi

git commit -m "chore(review): refresh clean snapshot" 2>/dev/null || true

# Push the branch
git push -u origin review-clean

# Put remote back to plain https (no token persisted in .git/config)
git remote set-url origin "$REPO_URL"
echo "✓ review-clean refreshed."
