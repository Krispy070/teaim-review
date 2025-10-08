# Memory Signals & Recommendations

The memory subsystem accepts implementation signals, mines correlations nightly, and exposes phase-aware recommendations for project teams.

## Feature Flag & Environment

- Set `MEMORY_ENABLED=1` to enable the `/api/memory/*` endpoints.
- The miner and API expect the optional `signals`, `memory_items`, and `lessons_learned` tables to exist. If any table is missing the handlers respond with `503` rather than crashing.

## Recording Signals

`POST /api/memory/signals`

Body (JSON):

```json
{
  "project_id": "UUID",
  "kind": "delay | dependency | approval_latency | defect_escape | scope_change",
  "severity": "low | med | high",
  "owner": "optional owner / team",
  "event_ts": "2025-01-01T12:00:00Z",
  "features": { "phase": "UAT", "vertical": "payroll" },
  "outcome": { "impact": "uat_slip" }
}
```

Notes:

- `event_ts` defaults to `now()` if omitted.
- `owner` is clamped to 120 characters.
- `features` and `outcome` are stored as JSON blobs for downstream mining.

## Recommendations

`GET /api/memory/recommendations?project_id=...&phase=UAT&k=5`

Response:

```json
{
  "recommendations": [
    {
      "recommendation": "Re-baseline the plan with buffer on the critical path...",
      "confidence": 0.82,
      "support": [
        { "id": "memory-item-1", "source_type": "playbook" }
      ],
      "phase": "uat",
      "vertical": "payroll"
    }
  ]
}
```

The miner enriches each lesson with citations to the supporting `memory_items` rows. Confidence is boosted when the caller requests a matching phase.

## Nightly Miner

The miner can be run manually or on a schedule:

```bash
pnpm mem:mine -- --project <PROJECT_ID> --days 45
```

CLI options:

- `--project` / `--project_id`: limit mining to a single project.
- `--days`: look-back window (default 30, capped at 365).

### Suggested GitHub Action

```yaml
name: Nightly Memory Miner

on:
  workflow_dispatch:
  schedule:
    - cron: "0 6 * * *"

jobs:
  mine:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10.18.1
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "pnpm"
      - run: pnpm install --frozen-lockfile
      - env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          MEMORY_ENABLED: "1"
        run: pnpm mem:mine
```

This workflow runs nightly at 06:00 UTC (adjust as needed) and can also be triggered manually.

## Table Expectations

| Table             | Purpose                                |
| ----------------- | -------------------------------------- |
| `signals`         | Raw project signals captured via API.  |
| `memory_items`    | Curated memory snippets used for cite. |
| `lessons_learned` | Miner output consumed by the API.      |

All tables should be deployed in the `public` schema.
