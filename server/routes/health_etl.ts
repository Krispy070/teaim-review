import { Router } from "express";
import { requireProject } from "../auth/projectAccess";
import { db } from "../db/client";
import { sql } from "drizzle-orm";

export const etl = Router();

etl.get("/etl", requireProject("member"), async (req, res, next) => {
  try {
    const projectId = String(req.query.projectId || "");
    if (!projectId) return res.status(400).json({ error: "projectId required" });

    const [{ rows: e }, { rows: p }, { rows: di }, { rows: dp }] = await Promise.all([
      db.execute(sql`select
                    sum(case when status='pending' then 1 else 0 end)::int as pending,
                    sum(case when status='running' then 1 else 0 end)::int as running,
                    sum(case when status='failed' then 1 else 0 end)::int as failed
                  from embed_jobs where project_id=${projectId}`),
      db.execute(sql`select
                    sum(case when status='pending' then 1 else 0 end)::int as pending,
                    sum(case when status='running' then 1 else 0 end)::int as running,
                    sum(case when status='failed' then 1 else 0 end)::int as failed
                  from parse_jobs where project_id=${projectId}`),
      db.execute(sql`select count(*)::int as n from docs where project_id=${projectId} and (indexed_at is null)`),
      db.execute(sql`select count(*)::int as n from docs where project_id=${projectId} and (parsed_at  is null)`),
    ]);

    res.json({
      ok: true,
      embed: e?.[0] || { pending:0, running:0, failed:0 },
      parse: p?.[0] || { pending:0, running:0, failed:0 },
      docsNeedingEmbeds: di?.[0]?.n ?? 0,
      docsNeedingParse:  dp?.[0]?.n ?? 0
    });
  } catch (err) { next(err); }
});

etl.post("/refresh-insights", requireProject("member"), async (req, res, next) => {
  try {
    const projectId = String(req.body?.projectId || "");
    if (!projectId) return res.status(400).json({ error: "projectId required" });

    const { rows } = await db.execute(sql`
      select id from docs where project_id=${projectId} and parsed_at is null
    `);
    if (!rows?.length) return res.json({ ok:true, queued:0 });

    for (const r of rows) {
      await db.execute(sql`
        insert into parse_jobs (doc_id, project_id, status) values (${(r as any).id}, ${projectId}, 'pending')
        on conflict do nothing
      `);
    }
    res.json({ ok: true, queued: rows.length });
  } catch (e) { next(e); }
});

etl.get("/ingest", requireProject("member"), async (req, res, next) => {
  try {
    const pid = String(req.query.projectId || "");
    if (!pid) return res.status(400).json({ error: "projectId required" });
    
    const [embed, parse] = await Promise.all([
      db.execute(sql`select status, count(*)::int as n from embed_jobs where project_id=${pid} group by status`),
      db.execute(sql`select status, count(*)::int as n from parse_jobs where project_id=${pid} group by status`),
    ]);
    const toMap = (rows: any[]) => Object.fromEntries((rows || []).map((r: any) => [r.status, r.n]));
    const runs = await db.execute(
      sql`select
          sum(case when status='success' then 1 else 0 end)::int as success,
          sum(case when status='failed' then 1 else 0 end)::int as failed
       from integration_runs where project_id=${pid} and finished_at >= now() - interval '24 hours'`
    );
    res.json({ ok: true, embed: toMap(embed.rows || []), parse: toMap(parse.rows || []), runs24: runs.rows?.[0] || { success: 0, failed: 0 } });
  } catch (e) { next(e); }
});

etl.get("/page", requireProject("member"), async (req, res, next) => {
  try {
    const pid = String(req.query.projectId || "");
    if (!pid) return res.status(400).json({ error: "projectId required" });
    
    const [docs, actions, risks, decisions, timeline, integrations, meetings, training] = await Promise.all([
      db.execute(sql`select count(*)::int as n from docs where project_id=${pid} and deleted_at is null`).then(r => Number(r.rows?.[0]?.n || 0)),
      db.execute(sql`select count(*)::int as n from actions where project_id=${pid}`).then(r => Number(r.rows?.[0]?.n || 0)),
      db.execute(sql`select count(*)::int as n from risks where project_id=${pid}`).then(r => Number(r.rows?.[0]?.n || 0)),
      db.execute(sql`select count(*)::int as n from decisions where project_id=${pid}`).then(r => Number(r.rows?.[0]?.n || 0)).catch(() => 0),
      db.execute(sql`select count(*)::int as n from timeline_events where project_id=${pid}`).then(r => Number(r.rows?.[0]?.n || 0)),
      db.execute(sql`select count(*)::int as n from integrations where project_id=${pid}`).then(r => Number(r.rows?.[0]?.n || 0)),
      db.execute(sql`select count(*)::int as n from meetings where project_id=${pid}`).then(r => Number(r.rows?.[0]?.n || 0)),
      db.execute(sql`select count(*)::int as n from training_plan where project_id=${pid}`).then(r => Number(r.rows?.[0]?.n || 0)),
    ]);
    res.json({ ok: true, counts: { docs, actions, risks, decisions, timeline, integrations, meetings, training } });
  } catch (e) { next(e); }
});
