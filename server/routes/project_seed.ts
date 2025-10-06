import { Router } from "express";
import { db } from "../db/client";
import { requireProject } from "../auth/projectAccess";
import { sql } from "drizzle-orm";

export const seed = Router();

seed.post("/defaults", requireProject("admin"), async (req, res, next) => {
  try {
    const projectId = String(req.body?.projectId || "");
    const projectCode = String(req.body?.projectCode || "PROJECT").replace(/[^A-Za-z0-9\-]/g,"");
    if (!projectId) return res.status(400).json({ error:"projectId required" });

    // Default PII policy & retention
    await db.execute(sql`
      insert into project_settings (project_id, project_code, pii_mode, allow_email_domains, allow_original_preview, retention_original_days, retention_doc_days, retention_hard_delete)
      values (${projectId},${projectCode},'strict','["kriana.com"]'::jsonb,false, 0, 0, false)
      on conflict (project_id) do nothing
    `);

    // Releases (demo/go-live placeholders)
    await db.execute(sql`
      insert into releases (project_id, title, starts_at)
      values
       (${projectId}, 'Config Sprint 1 Demo', now() + interval '14 days'),
       (${projectId}, 'Go-Live', now() + interval '120 days')
      on conflict do nothing
    `);

    res.json({ ok:true });
  } catch (e) { next(e); }
});
