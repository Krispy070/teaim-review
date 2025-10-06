import { Router } from "express";
import { db } from "../db/client";
import { requireProject } from "../auth/projectAccess";
import { sql } from "drizzle-orm";

export const ausers = Router();

const ALL = ["errors", "queue", "run_failed", "run_success", "training_upcoming", "cadence_upcoming", "daily_brief"];

ausers.get("/", requireProject("member"), async (req, res) => {
  const pid = String(req.query.projectId || "");
  const { rows } = await db.execute(
    sql`select id, user_email as "userEmail", events, email, slack_webhook_id as "slackWebhookId",
            coalesce(digest,'immediate') as digest, mute_until as "muteUntil"
       from user_alerts where project_id=${pid} order by created_at desc`
  );
  res.json({ ok: true, items: rows || [], all: ALL });
});

ausers.post("/upsert", requireProject("member"), async (req, res) => {
  const { projectId, userEmail, events = [], email = true, slackWebhookId = null, digest = 'immediate', muteUntil = null } = req.body || {};
  if (!projectId || !userEmail) return res.status(400).json({ error: "projectId & userEmail" });
  await db.execute(
    sql`insert into user_alerts (project_id, user_email, events, email, slack_webhook_id, digest, mute_until)
     values (${projectId},${userEmail.toLowerCase()},${JSON.stringify(events)},${!!email},${slackWebhookId || null},${String(digest || 'immediate')},${muteUntil || null})
     on conflict (project_id, user_email)
     do update set events=${JSON.stringify(events)}, email=${!!email}, slack_webhook_id=${slackWebhookId || null}, digest=${String(digest || 'immediate')}, mute_until=${muteUntil || null}, created_at=created_at`
  );
  res.json({ ok: true });
});

ausers.post("/test", requireProject("member"), async (req, res) => {
  const { projectId, userEmail, event = "errors" } = req.body || {};
  if (!projectId || !userEmail) return res.status(400).json({ error: "projectId & userEmail" });
  const u = (await db.execute(
    sql`select email, slack_webhook_id as "slackWebhookId", events, coalesce(digest,'immediate') as digest, mute_until as "muteUntil"
       from user_alerts where project_id=${projectId} and user_email=${userEmail.toLowerCase()}`
  )).rows?.[0] as any;
  if (!u) return res.status(404).json({ error: "subscriber not found" });
  const now = Date.now();
  if (u.muteUntil && new Date(u.muteUntil).getTime() > now) return res.json({ ok: true, muted: true });

  const { sendEmail } = await import("../lib/notify");
  const { sendSlackWebhook } = await import("../lib/slack");
  const wh = u.slackWebhookId ? (await db.execute(sql`select url, label from webhooks where id=${u.slackWebhookId}`)).rows?.[0] : null;

  if (u.email) await sendEmail([userEmail], `[TEAIM] Test alert (${event})`, `Project ${projectId}\nDigest: ${u.digest}\nThis is a test alert for ${event}.`);
  if (wh?.url) await sendSlackWebhook(wh.url as any, `Test alert (${event}) for project ${projectId} (digest ${u.digest})`);

  res.json({ ok: true, muted: false });
});

// POST /api/alerts/users/snooze  { projectId, userEmail, preset: '1h'|'8h'|'24h'|'off' }
ausers.post("/snooze", requireProject("member"), async (req, res) => {
  const { projectId, userEmail, preset } = req.body || {};
  if (!projectId || !userEmail || !preset) return res.status(400).json({ error: "projectId, userEmail, preset required" });

  let until: string | null = null;
  if (preset !== "off") {
    const mins = preset === "1h" ? 60 : preset === "8h" ? 480 : 1440;
    until = new Date(Date.now() + mins * 60 * 1000).toISOString();
  }
  await db.execute(
    sql`insert into user_alerts (project_id, user_email, mute_until)
     values (${projectId},${userEmail.toLowerCase()},${until})
     on conflict (project_id, user_email)
     do update set mute_until=${until}, created_at=created_at`
  );
  res.json({ ok: true, muteUntil: until });
});

// POST /api/alerts/project-snooze  { projectId, preset: '1h'|'8h'|'24h'|'off' }
ausers.post("/project-snooze", requireProject("member"), async (req, res) => {
  const { projectId, preset } = req.body || {};
  if (!projectId || !preset) return res.status(400).json({ error: "projectId & preset" });

  let until: string | null = null;
  if (preset !== "off") {
    const mins = preset === "1h" ? 60 : preset === "8h" ? 480 : 1440;
    until = new Date(Date.now() + mins * 60 * 1000).toISOString();
  }
  await db.execute(
    sql`insert into project_settings (project_id, alerts_muted_until)
     values (${projectId},${until})
     on conflict (project_id)
     do update set alerts_muted_until=${until}, updated_at=now()`
  );
  res.json({ ok: true, muteUntil: until });
});

// GET /api/alerts/project-snooze/status?projectId=
ausers.get("/project-snooze/status", requireProject("member"), async (req, res) => {
  const pid = String(req.query.projectId || "");
  const { rows } = await db.execute(
    sql`select alerts_muted_until as "muteUntil" from project_settings where project_id=${pid}`
  );
  res.json({ ok: true, muteUntil: rows?.[0]?.muteUntil || null });
});
