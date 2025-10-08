# TEAIM Memory — Quick Start & Demo Kit

TEAIM’s opt-in memory subsystem stores normalized text with lineage (docs, Slack, meetings, release notes), retrieves it with a hybrid ranker, and mines nightly “lessons learned.” This page covers setup, demo seeding, and the Slack `/demo-kit`.

---

## Enable (env)

MEMORY_ENABLED=1
OPENAI_API_KEY=<your key>
MEMORY_EMBED_MODEL=text-embedding-3-large
TENANT_PII_POLICY=standard # strict|standard|off
SHOW_MEMORY_PROMPTS=1 # optional UI surfacing

markdown
Copy code

If `MEMORY_ENABLED!=1` or `OPENAI_API_KEY` is missing, endpoints return **503** (fail-closed).

---

## Endpoints

- `GET  /api/memory/health` → `{ ok, memoryEnabled, embedEnabled }`
- `POST /api/memory/ingest`
  - Body: `{ project_id, source_type: "docs"|"slack"|"csv_release"|"meetings", payload, policy? }`
- `POST /api/memory/retrieve`
  - Body: `{ project_id, query, k?, phase?, filters? }` → `{ contexts[], debug }`
- `GET  /api/memory/recommendations?project_id=...&phase=...` → mined suggestions
- `POST /api/memory/signals` → `{ project_id, kind, severity?, owner?, event_ts?, features?, outcome? }`

**Scoring** (hybrid): `0.45*semantic + 0.25*recency + 0.20*sourceType + 0.10*phaseBoost`.

---

## Demo seeding (local)

Seed a small set (release notes, meeting snippets, risk excerpts):

One-time
pnpm i

Provide a project id via env or CLI
export DEMO_PROJECT_ID="<project uuid>"

Optional helpers
export DEMO_API_BASE_URL="http://127.0.0.1:3000"
export DEMO_API_TOKEN="Bearer <session token>"

Run seeder
pnpm mem:demo

or inline
pnpm mem:demo 00000000-0000-4000-8000-000000000000

markdown
Copy code

You’ll see counts and example queries to try: **“release blockers”**, **“uat defects”**, **“handoff risks”**.

---

## Slack `/demo-kit` (optional)

Let testers seed and get a clickable walkthrough right in Slack (channel like `#teaim-dev`).

**Slash command config**

- Command: `/demo-kit`
- Request URL: `https://<your-host>/api/internal/slack/demo-kit`
- Short description: `Seed TEAIM memory demo for a project`
- Usage hint: `<projectId>`

**Server env**

SLACK_DEMO_TOKEN=<verification token for the slash command> # required

One of:
SLACK_BOT_TOKEN=xoxb-... # recommended bot posting

or
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/... # fallback webhooks
APP_BASE_URL=https://<your-app-host> # used for building links in the post
DATABASE_URL=postgres://... # required for seeding
MEMORY_ENABLED=1

markdown
Copy code

**What it does**

- Validates the slash command using `SLACK_DEMO_TOKEN`.
- Seeds the same content as `pnpm mem:demo` for the supplied `<projectId>`.
- Posts a Slack message with:
  - A short summary (what was seeded),
  - 2–3 suggested queries,
  - Direct links (APP_BASE_URL) to relevant pages (e.g., Release / UAT views).

**Usage**

In Slack:
/demo-kit <projectId>

yaml
Copy code
The slash reply shows a quick confirmation; the bot/webhook follows up with the richer message once seeding completes.

> Notes:
> - If `DATABASE_URL` is missing, the endpoint should respond with a friendly error (“DB not configured”).
> - If neither `SLACK_BOT_TOKEN` nor `SLACK_WEBHOOK_URL` is set, seed but log a warning and skip posting.

---

## Nightly miner

Run correlations and refresh `lessons_learned` nightly:

- Script: `pnpm mem:mine`
- GitHub Action: `.github/workflows/memory-mine.yml`
  - Skips gracefully when `DATABASE_URL` is not set.

---

## Safety & PII

- `TENANT_PII_POLICY` controls redaction:
  - **strict** → replace matches with `[REDACTED:<TYPE>]`
  - **standard** → redact high-confidence only (default)
  - **off** → no redaction
- Ingest responses include a small `pii_stats` summary.
- Large payloads (> 2MB) should return **413**.

---

## Troubleshooting

- `503 memory disabled` → set `MEMORY_ENABLED=1`.
- `503 embedding disabled` → set `OPENAI_API_KEY` and `MEMORY_EMBED_MODEL`.
- Unexpected results? Use the `debug` block from `/retrieve` (weights + candidate counts) to tune.

