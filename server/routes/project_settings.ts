import { Router, Request, Response } from "express";
import { requireProject } from "../auth/projectAccess";
import { randomBytes } from "crypto";
import { db } from "../db/client";
import { sql } from "drizzle-orm";

export const psettings = Router();

const INGEST_DOMAIN = process.env.INGEST_DOMAIN || "ingest.teaim.local";

psettings.get("/ingest-alias", requireProject("member"), async (req: Request, res: Response) => {
  const projectId = req.query.projectId as string;
  
  try {
    const result = await db.execute(sql`
      SELECT ingest_alias_token, ingest_alias_slug, code 
      FROM projects 
      WHERE id = ${projectId}
    `);
    
    const rows = result.rows || [];
    
    if (rows.length === 0) {
      return res.json({ ingestEmail: null });
    }
    
    const row = rows[0] as any;
    
    if (!row.ingest_alias_token || !row.ingest_alias_slug) {
      return res.json({ ingestEmail: null });
    }
    
    const email = `ingest+${row.code}.${row.ingest_alias_slug}.${row.ingest_alias_token}@${INGEST_DOMAIN}`;
    res.json({ ingestEmail: email });
  } catch (error) {
    console.error("Error fetching ingest alias:", error);
    res.status(500).json({ error: "Failed to fetch ingest alias" });
  }
});

psettings.post("/rotate-ingest-alias", requireProject("admin"), async (req: Request, res: Response) => {
  const { projectId } = req.body;
  
  if (!projectId) {
    return res.status(400).json({ error: "projectId required" });
  }
  
  try {
    const slug = randomBytes(4).toString("hex");
    const token = randomBytes(8).toString("hex");
    
    await db.execute(sql`
      UPDATE projects 
      SET ingest_alias_slug = ${slug}, 
          ingest_alias_token = ${token}
      WHERE id = ${projectId}
    `);
    
    const result = await db.execute(sql`
      SELECT code FROM projects WHERE id = ${projectId}
    `);
    
    const rows = result.rows || [];
    if (rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }
    
    const projectCode = (rows[0] as any).code;
    const email = `ingest+${projectCode}.${slug}.${token}@${INGEST_DOMAIN}`;
    
    res.json({ ok: true, ingestEmail: email });
  } catch (error) {
    console.error("Error rotating ingest alias:", error);
    res.status(500).json({ error: "Failed to rotate ingest alias" });
  }
});

psettings.get("/pii", requireProject("admin"), async (req: Request, res: Response) => {
  try {
    const projectId = req.query.projectId as string;
    const result = await db.execute(sql`
      SELECT pii_mode as "piiMode", 
             allow_email_domains as "allowEmailDomains", 
             allow_original_preview as "allowOriginalPreview"
      FROM project_settings 
      WHERE project_id = ${projectId}
    `);
    const rows = result.rows || [];
    res.json({ ok: true, ...(rows?.[0] || { piiMode: "strict", allowEmailDomains: [], allowOriginalPreview: false }) });
  } catch (error) {
    console.error("Error fetching PII policy:", error);
    res.status(500).json({ error: "Failed to fetch PII policy" });
  }
});

psettings.post("/pii", requireProject("admin"), async (req: Request, res: Response) => {
  try {
    const { projectId, piiMode, allowEmailDomains, allowOriginalPreview } = req.body || {};
    if (!projectId) return res.status(400).json({ error: "projectId required" });
    
    await db.execute(sql`
      INSERT INTO project_settings (project_id, pii_mode, allow_email_domains, allow_original_preview)
      VALUES (${projectId}, ${piiMode || "strict"}, ${JSON.stringify(allowEmailDomains || [])}, ${!!allowOriginalPreview})
      ON CONFLICT (project_id)
      DO UPDATE SET 
        pii_mode = ${piiMode || "strict"}, 
        allow_email_domains = ${JSON.stringify(allowEmailDomains || [])}, 
        allow_original_preview = ${!!allowOriginalPreview}, 
        updated_at = NOW()
    `);
    res.json({ ok: true });
  } catch (error) {
    console.error("Error updating PII policy:", error);
    res.status(500).json({ error: "Failed to update PII policy" });
  }
});
