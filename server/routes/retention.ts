import { Router } from "express";
import { requireProject } from "../auth/projectAccess";
import { db } from "../db/client";
import { sql } from "drizzle-orm";

export const retention = Router();

retention.get("/", requireProject("admin"), async (req, res, next) => {
  try {
    const projectId = String(req.query.projectId||"");
    const { rows } = await db.execute(
      sql`select retention_original_days as "originalDays",
              retention_doc_days as "docDays",
              retention_hard_delete as "hardDelete",
              artifact_retention_days as "artifactDays",
              artifact_max_gb as "artifactMaxGB"
         from project_settings where project_id=${projectId}`
    ) as any;
    const row = rows?.[0] || {};
    res.json({ 
      ok:true, 
      originalDays: row.originalDays ?? 0, 
      docDays: row.docDays ?? 0, 
      hardDelete: row.hardDelete ?? false,
      artifactDays: row.artifactDays ?? 30,
      artifactMaxGB: row.artifactMaxGB ?? 10
    });
  } catch (e) { next(e); }
});

retention.post("/", requireProject("admin"), async (req, res, next) => {
  try {
    const { projectId, originalDays=0, docDays=0, hardDelete=false, artifactDays=30, artifactMaxGB=10 } = req.body || {};
    if (!projectId) return res.status(400).json({ error:"projectId required" });
    await db.execute(
      sql`insert into project_settings (project_id, retention_original_days, retention_doc_days, retention_hard_delete, artifact_retention_days, artifact_max_gb)
       values (${projectId},${originalDays},${docDays},${hardDelete},${artifactDays},${artifactMaxGB})
       on conflict (project_id) do update set retention_original_days=${originalDays}, retention_doc_days=${docDays}, retention_hard_delete=${hardDelete}, artifact_retention_days=${artifactDays}, artifact_max_gb=${artifactMaxGB}, updated_at=now()`
    );
    res.json({ ok:true });
  } catch (e) { next(e); }
});
