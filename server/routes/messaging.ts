import { Router } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { requireProject } from "../auth/projectAccess";
import { sendSlackWebhook } from "../lib/slack";
import fetch from "node-fetch";

export const msg = Router();

async function getGraphAccessToken(projectId: string): Promise<string | null> {
  return null;
}

msg.get("/channels", requireProject("member"), async (req, res) => {
  const pid = String(req.query.projectId || "");
  const rows = (await db.execute(
    sql`select id, category, slack_webhook_id as "slackWebhookId", teams_team_id as "teamsTeamId", teams_channel_id as "teamsChannelId", updated_at as "updatedAt"
       from project_channels where project_id=${pid} order by category`
  )).rows || [];
  res.json({ ok: true, items: rows });
});

msg.post("/channels", requireProject("member"), async (req, res) => {
  const { projectId, category, slackWebhookId = null, teamsTeamId = null, teamsChannelId = null } = req.body || {};
  if (!projectId || !category) return res.status(400).json({ error: "projectId & category" });
  await db.execute(
    sql`insert into project_channels (project_id, category, slack_webhook_id, teams_team_id, teams_channel_id, updated_at)
     values (${projectId}, ${category}, ${slackWebhookId}, ${teamsTeamId}, ${teamsChannelId}, now())
     on conflict (project_id, category) do update set
       slack_webhook_id=${slackWebhookId}, teams_team_id=${teamsTeamId}, teams_channel_id=${teamsChannelId}, updated_at=now()`
  );
  res.json({ ok: true });
});

msg.post("/post", requireProject("member"), async (req, res) => {
  const { projectId, category = "alerts", text, link = null } = req.body || {};
  if (!projectId || !text) return res.status(400).json({ error: "projectId & text" });

  const row = (await db.execute(
    sql`select slack_webhook_id as "whId", teams_team_id as "teamId", teams_channel_id as "chanId"
       from project_channels where project_id=${projectId} and category=${category} limit 1`
  )).rows?.[0] as any;

  let postedSlack = 0, postedTeams = 0;

  if (row?.whId) {
    const whRow = (await db.execute(sql`select url from webhooks where id=${String(row.whId)}`)).rows?.[0] as any;
    if (whRow?.url) { await sendSlackWebhook(whRow.url, `${text}${link ? `\n${link}` : ""}`); postedSlack++; }
  }
  if (!postedSlack) {
    const hooks = (await db.execute(
      sql`select url from webhooks where project_id=${projectId} and (events @> ${JSON.stringify([category])}::jsonb)`
    )).rows || [];
    for (const h of hooks) { await sendSlackWebhook((h as any).url, `${text}${link ? `\n${link}` : ""}`); postedSlack++; }
  }

  if (row?.teamId && row?.chanId) {
    const token = await getGraphAccessToken(projectId).catch(() => null);
    if (token) {
      const url = `https://graph.microsoft.com/v1.0/teams/${encodeURIComponent(String(row.teamId))}/channels/${encodeURIComponent(String(row.chanId))}/messages`;
      await fetch(url, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ body: { content: `${text}${link ? `<br/><a href="${link}">${link}</a>` : ""}` } })
      });
      postedTeams++;
    }
  }

  res.json({ ok: true, postedSlack, postedTeams });
});

export default msg;
