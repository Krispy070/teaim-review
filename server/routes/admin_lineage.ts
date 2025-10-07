import { Router } from "express";
import { db } from "../db/client";
import { requireRole } from "../auth/supabaseAuth";
import { logAudit } from "../lib/audit";
import { sql } from "drizzle-orm";

export const lineageAdmin = Router();

/** POST /api/admin/lineage/backfill
 *  body: { projectId, dryRun?: boolean }
 *  - Sets origin_type='doc', origin_id=doc_id where doc_id is not null and origin is null (actions, timeline_events)
 *  - Risks/Decisions: same, if doc_id column exists (risks may not have doc_id; falls back to only origin if present)
 */
lineageAdmin.post("/backfill", requireRole("admin"), async (req, res) => {
  const { projectId, dryRun = true } = req.body || {};
  if (!projectId) return res.status(400).json({ error: "projectId required" });

  // actions
  const actPreview = await db.execute(sql`
    select count(*)::int as n
      from actions
     where project_id=${projectId} and doc_id is not null and origin_type is null
  `);

  // timeline
  const tlPreview = await db.execute(sql`
    select count(*)::int as n
      from timeline_events
     where project_id=${projectId} and doc_id is not null and origin_type is null
  `);

  // decisions (if table exists)
  let decPreview = { rows: [{ n: 0 }] as any[] };
  try {
    decPreview = await db.execute(sql`
      select count(*)::int as n
        from decisions
       where project_id=${projectId} and doc_id is not null and origin_type is null
    `);
  } catch {}

  // risks: some schemas have doc_id; if not, we just set missing origin if doc_id exists
  let riskPreview = { rows: [{ n: 0 }] as any[] };
  try {
    riskPreview = await db.execute(sql`
      select count(*)::int as n
        from risks
       where project_id=${projectId} and (source_doc_id is not null) and origin_type is null
    `);
  } catch {}

  const preview = {
    actions: actPreview.rows?.[0]?.n || 0,
    timeline: tlPreview.rows?.[0]?.n || 0,
    decisions: decPreview.rows?.[0]?.n || 0,
    risks: riskPreview.rows?.[0]?.n || 0,
  };

  if (dryRun) return res.json({ ok: true, dryRun: true, preview });

  // Commit updates
  const results: any = {};

  const actRes = await db.execute(sql`
    update actions
       set origin_type='doc', origin_id=doc_id
     where project_id=${projectId} and doc_id is not null and origin_type is null
  `);
  results.actions = actRes.rowCount || 0;

  const tlRes = await db.execute(sql`
    update timeline_events
       set origin_type='doc', origin_id=doc_id
     where project_id=${projectId} and doc_id is not null and origin_type is null
  `);
  results.timeline = tlRes.rowCount || 0;

  try {
    const decRes = await db.execute(sql`
      update decisions
         set origin_type='doc', origin_id=doc_id
       where project_id=${projectId} and doc_id is not null and origin_type is null
    `);
    results.decisions = decRes.rowCount || 0;
  } catch { results.decisions = 0; }

  try {
    const riskRes = await db.execute(sql`
      update risks
         set origin_type='doc', origin_id=source_doc_id
       where project_id=${projectId} and source_doc_id is not null and origin_type is null
    `);
    results.risks = riskRes.rowCount || 0;
  } catch { results.risks = 0; }

  await logAudit(req as any, projectId, "update", "lineage", undefined, { backfill: results });

  res.json({ ok: true, dryRun: false, results });
});

export default lineageAdmin;
