import { Router } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { requireProject } from "../auth/projectAccess";
import fetch from "node-fetch";
import { parseICS } from "../lib/ics";

export const cal = Router();

cal.get("/connectors", requireProject("member"), async (req, res) => {
  const pid = String(req.query.projectId || "");
  const { rows } = await db.execute(
    sql`select id, label, source, url, created_at as "createdAt" from calendar_connectors where project_id=${pid} order by created_at desc`
  );
  res.json({ ok: true, items: rows || [] });
});

cal.post("/connectors/add", requireProject("member"), async (req, res) => {
  const { projectId, label, url } = req.body || {};
  if (!projectId || !url) return res.status(400).json({ error: "projectId & url" });
  await db.execute(sql`insert into calendar_connectors (project_id, label, url) values (${projectId}, ${label || null}, ${url})`);
  res.json({ ok: true });
});

cal.delete("/connectors/:id", requireProject("member"), async (req, res) => {
  const connectorId = String(req.params.id || "");
  const { projectId } = req.body || {};
  if (!projectId) return res.status(400).json({ error: "projectId required" });
  const result = await db.execute(sql`delete from calendar_connectors where id=${connectorId} and project_id=${projectId}`);
  res.json({ ok: true });
});

cal.post("/pull", requireProject("member"), async (req, res) => {
  const { projectId } = req.body || {};
  if (!projectId) return res.status(400).json({ error: "projectId required" });
  const cons = (await db.execute(sql`select id, url from calendar_connectors where project_id=${projectId}`)).rows || [];
  let imported = 0;
  for (const c of cons) {
    try {
      const r = await fetch((c as any).url);
      if (!r.ok) continue;
      const text = await r.text();
      const events = parseICS(text);
      for (const ev of events) {
        const st = ev.dtstart ? new Date(ev.dtstart.replace(/Z?$/, "Z")) : null;
        const en = ev.dtend ? new Date(ev.dtend.replace(/Z?$/, "Z")) : null;
        if (!st) continue;
        const metaJson = JSON.stringify({ connectorId: (c as any).id, raw: (ev.description || "").slice(0, 4000) });
        await db.execute(
          sql`insert into meetings (project_id, title, starts_at, ends_at, location, link, attendees, source, meta)
           values (${projectId}, ${ev.summary || "(untitled)"}, ${st.toISOString()}, ${en?.toISOString() || null}, ${ev.location || null}, ${ev.url || null}, ${'[]'}, ${"ics"}, ${metaJson}::jsonb)
           on conflict do nothing`
        );
        imported++;
      }
    } catch {}
  }
  res.json({ ok: true, imported });
});

cal.get("/meetings", requireProject("member"), async (req, res) => {
  const pid = String(req.query.projectId || "");
  const { rows } = await db.execute(
    sql`select id, title, starts_at as "startsAt", ends_at as "endsAt", location, link, attendees, source
       from meetings where project_id=${pid} order by starts_at desc limit 500`
  );
  res.json({ ok: true, items: rows || [] });
});

cal.post("/meetings/:id/transcript", requireProject("member"), async (req, res) => {
  const mid = String(req.params.id || "");
  const { transcriptText } = req.body || {};
  await db.execute(sql`update meetings set transcript_text=${transcriptText || ""} where id=${mid}`);
  const proj = (await db.execute(sql`select project_id as "projectId", title from meetings where id=${mid}`)).rows?.[0];
  if (proj) {
    const { rows: d } = await db.execute(
      sql`insert into docs (project_id, name, mime, size_bytes, full_text, summary, keywords, meta, has_pii)
       values (${(proj as any).projectId}, ${`Meeting Transcript — ${(proj as any).title}`}, ${"text/plain"}, ${0}, ${transcriptText || ""}, ${null}, ${'[]'}, ${JSON.stringify({ meetingId: mid })}::jsonb, ${false}) returning id`
    );
    await db.execute(
      sql`insert into embed_jobs (project_id, doc_id, status) values (${(proj as any).projectId}, ${(d[0] as any).id}, ${"pending"}) on conflict do nothing`
    );
    await db.execute(
      sql`insert into parse_jobs (project_id, doc_id, status) values (${(proj as any).projectId}, ${(d[0] as any).id}, ${"pending"}) on conflict do nothing`
    );
  }
  res.json({ ok: true });
});

export default cal;
