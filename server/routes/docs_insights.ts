import { Router } from "express";
import { db } from "../db/client";
import { requireProject, getProjectIdFromReq } from "../auth/projectAccess";
import { sql } from "drizzle-orm";

export const docx = Router();

// POST /api/docs/:id/requeue  { projectId, embed?:bool, parse?:bool }
docx.post("/:id/requeue", requireProject("member"), async (req, res) => {
  const id = String(req.params.id || "");
  const { embed = true, parse = true } = req.body || {};
  
  // Use the authenticated projectId from middleware (already validated)
  const authenticatedProjectId = getProjectIdFromReq(req);
  if (!authenticatedProjectId) return res.status(400).json({ error: "projectId required" });

  // Verify document belongs to the authenticated project
  const { rows } = await db.execute(sql`select project_id from docs where id=${id} limit 1`);
  if (!rows?.length) return res.status(404).json({ error: "Document not found" });
  const docProjectId = (rows[0] as any).project_id;
  if (docProjectId !== authenticatedProjectId) {
    return res.status(403).json({ error: "Document does not belong to this project" });
  }

  if (embed) await db.execute(sql`insert into embed_jobs (project_id, doc_id, status) values (${docProjectId}, ${id}, 'pending') on conflict do nothing`);
  if (parse) await db.execute(sql`insert into parse_jobs (project_id, doc_id, status) values (${docProjectId}, ${id}, 'pending') on conflict do nothing`);
  res.json({ ok: true });
});

// GET /api/docs/:id/insights
docx.get("/:id/insights", requireProject("member"), async (req, res) => {
  const id = String(req.params.id || "");
  
  // Use the authenticated projectId from middleware (already validated)
  const authenticatedProjectId = getProjectIdFromReq(req);
  if (!authenticatedProjectId) return res.status(400).json({ error: "projectId required" });

  // Verify document belongs to the authenticated project
  const { rows: docRows } = await db.execute(sql`select project_id from docs where id=${id} limit 1`);
  if (!docRows?.length) return res.status(404).json({ error: "Document not found" });
  const docProjectId = (docRows[0] as any).project_id;
  if (docProjectId !== authenticatedProjectId) {
    return res.status(403).json({ error: "Document does not belong to this project" });
  }

  const [acts, risks, times, decs] = await Promise.all([
    db.execute(sql`select id, title, owner as assignee, due_date as "dueAt", status, priority from actions where doc_id=${id} or (origin_type='doc' and origin_id=${id}) order by created_at desc limit 200`),
    db.execute(sql`select id, title, severity, status from risks where origin_type='doc' and origin_id=${id} order by created_at desc limit 200`).catch(() => ({ rows: [] })),
    db.execute(sql`select id, title, type, starts_at as "startsAt" from timeline_events where origin_type='doc' and origin_id=${id} order by coalesce(starts_at, created_at) desc limit 200`),
    db.execute(sql`select id, decision, decided_at as "decidedAt" from decisions where origin_type='doc' and origin_id=${id} order by created_at desc limit 200`).catch(() => ({ rows: [] })),
  ]);
  res.json({ ok: true, actions: acts.rows || [], risks: risks.rows || [], timeline: times.rows || [], decisions: decs.rows || [] });
});

export default docx;
