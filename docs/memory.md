# Memory tooling

## Slack `/demo-kit`

Use the `/demo-kit <projectId>` slash command in `#teaim-dev` to backfill demo
memory highlights and post a clickthrough bundle for the team.

1. Configure the slash command to `POST` to
   `https://<your-host>/api/internal/slack/demo-kit`.
2. Set the `SLACK_DEMO_TOKEN` secret in the server environment and reuse it as
   the verification token for the Slack command.
3. Provide either `SLACK_BOT_TOKEN` (recommended) or `SLACK_WEBHOOK_URL` so the
   server can post into Slack once the seed completes.
4. Ensure `DATABASE_URL` and `APP_BASE_URL` are set; the script writes directly
   to `mem_entries` and builds project links with the base URL.

When triggered, the server runs `scripts/slack-demo-kit.mjs` which:

- wipes any previous `content.source = "slack-demo-kit"` rows for the project,
- inserts three curated memory entries focused on handoffs, UAT defects, and
  release blockers, and
- posts timeline, risks, and decisions links plus suggested queries
  (`handoff risks`, `uat defects`, `release blockers`).

The endpoint responds to Slack immediately so the command shows a confirmation,
while the channel receives the richer block message once posting succeeds.
