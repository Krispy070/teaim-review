import { Router } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { requireProject } from "../auth/projectAccess";

export const briefs = Router();

async function collect(projectId: string, fromISO: string, toISO: string) {
  const queries = await Promise.all([
    db.execute(
      sql`select id, name, created_at as "at" from docs where project_id=${projectId} and created_at between ${fromISO} and ${toISO} order by created_at desc`
    ),
    db.execute(
      sql`select id, title, status, due_date as "dueAt", created_at as "at" from actions where project_id=${projectId} and created_at between ${fromISO} and ${toISO} order by created_at desc`
    ),
    db.execute(
      sql`select id, title, severity, status, updated_at as "at" from risks where project_id=${projectId} and updated_at between ${fromISO} and ${toISO} order by updated_at desc`
    ),
    db.execute(
      sql`select id, integration_id as "iid", status, note, finished_at as "at" from integration_runs where project_id=${projectId} and finished_at between ${fromISO} and ${toISO} order by finished_at desc`
    ),
  ]);
  return {
    docs: queries[0].rows || [],
    actions: queries[1].rows || [],
    risks: queries[2].rows || [],
    runs: queries[3].rows || [],
  };
}

function renderText(pid: string, period: { from: string; to: string }, data: any) {
  const dueSoon = (data.actions || []).filter(
    (a: any) =>
      a.dueAt && new Date(a.dueAt).getTime() - Date.now() < 72 * 3600 * 1000 && (a.status || "open") !== "done"
  );
  const hotRisks = (data.risks || []).filter((r: any) => (r.severity || 0) >= 20 && (r.status || "open") !== "closed");
  const failures = (data.runs || []).filter((r: any) => r.status === "failed" || r.status === "missed");
  const lines = [
    `TEAIM Daily Brief — Project ${pid}`,
    `Period: ${new Date(period.from).toLocaleString()} → ${new Date(period.to).toLocaleString()}`,
    ``,
    `New/Updated Docs: ${data.docs.length}`,
    `Actions updated:  ${data.actions.length}`,
    `Risks touched:    ${data.risks.length}`,
    `Integration runs:  ${data.runs.length}`,
    ``,
    `⚑ Call-outs`,
    `• Due soon (${dueSoon.length}): ${
      dueSoon
        .slice(0, 5)
        .map((a: any) => a.title)
        .join("; ") || "-"
    }`,
    `• High severity risks (${hotRisks.length}): ${
      hotRisks
        .slice(0, 5)
        .map((r: any) => r.title + " (sev " + r.severity + ")")
        .join("; ") || "-"
    }`,
    `• Failed/Missed runs (${failures.length}): ${
      failures
        .slice(0, 5)
        .map((r: any) => r.iid || r.id)
        .join(", ") || "-"
    }`,
    ``,
    `Docs: ${
      data.docs
        .slice(0, 5)
        .map((d: any) => d.name)
        .join("; ") || "-"
    }`,
  ];
  const highlights = { dueSoon, hotRisks, failures };
  return { text: lines.join("\n"), highlights };
}

briefs.post("/generate", requireProject("member"), async (req, res) => {
  const { projectId, hoursBack = 24 } = req.body || {};
  if (!projectId) return res.status(400).json({ error: "projectId required" });
  const to = new Date();
  const from = new Date(to.getTime() - Number(hoursBack) * 3600 * 1000);
  const data = await collect(projectId, from.toISOString(), to.toISOString());
  const { text, highlights } = renderText(projectId, { from: from.toISOString(), to: to.toISOString() }, data);

  const highlightsJson = JSON.stringify(highlights);
  await db.execute(
    sql`insert into daily_briefs (project_id, period_start, period_end, summary, highlights) values (${projectId}, ${from.toISOString()}, ${to.toISOString()}, ${text}, ${highlightsJson}::jsonb)`
  );

  const wh = (
    await db.execute(
      sql`select url from webhooks where project_id=${projectId} and (events @> ${JSON.stringify(["daily_brief"])}::jsonb)`
    )
  ).rows || [];
  if (wh.length) {
    const { sendSlackWebhook } = await import("../lib/slack");
    for (const w of wh) {
      try {
        await sendSlackWebhook((w as any).url, "```" + text + "```");
      } catch {}
    }
  }

  res.json({ ok: true, brief: { text, highlights } });
});

export default briefs;
