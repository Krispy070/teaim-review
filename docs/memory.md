# Memory Demo Seeding

This repository ships with a scripted demo so you can populate semantic memory with a single command and immediately try the retrieval experience.

## Quick start
1. Make sure the API process is running locally and you can reach it at `http://127.0.0.1:3000` (override with `DEMO_API_BASE_URL`).
2. Export the identifiers the script needs:
   ```bash
   export DEMO_PROJECT_ID="<project uuid>"
   # optional helpers
   export DEMO_ORG_ID="<org uuid>"
   export DEMO_API_BASE_URL="https://app.example.com"   # defaults to http://127.0.0.1:3000
   export DEMO_API_TOKEN="Bearer <session token>"        # attach auth header when required
   ```
3. Run the seeder:
   ```bash
   pnpm mem:demo
   # or supply a project inline
   pnpm mem:demo 00000000-0000-4000-8000-000000000000
   ```

The script calls `POST /api/memory/ingest` three times (once per source type) with `policy="standard"`:
- **csv_release** - three curated release note rows that highlight sprint outcomes and follow-ups.
- **meeting_transcript** - two short standups with actions, variances, and go-live checkpoints.
- **doc** - two risk register excerpts that cover payroll and integrations exposure.

You should see console output similar to:
```
Seeding memory demo for project ...
-> Release notes (csv_release) ... ok (3 entries)
-> Meeting transcripts ... ok (2 entries)
-> Risk register excerpts ... ok (2 entries)

Demo ingest complete
   • Release notes (csv_release): 3
   • Meeting transcripts: 2
   • Risk register excerpts: 2
   • Total memories added: 7
```

## What to try after seeding
Paste any of these prompts into the Memory search UI to verify retrieval quality:
- "What's the status of payroll parallel testing?"
- "List integration risks blocking go-live."
- "Summarize actions from the cutover readiness standup."

Each query should surface the new entries immediately, demonstrating how the Workday project memory accelerates executive briefings, risk reviews, and readiness updates.
