import { Router } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";

export const projManage = Router();

projManage.post("/create", async (req, res) => {
  const { name, code } = req.body || {};
  if (!name || !code) {
    return res.status(400).json({ ok: false, error: "name & code required" });
  }

  try {
    const userId = (req as any).user?.sub || (req as any).user?.id;
    const userEmail = (req as any).user?.email || "";
    const orgId = (req as any).orgId;

    if (!userId || !orgId) {
      return res.status(401).json({ ok: false, error: "Authentication required" });
    }

    const result: any = await db.execute(sql`
      insert into projects (org_id, name, code, status, created_at, updated_at)
      values (${orgId}, ${name}, ${code}, 'active', now(), now())
      returning id
    `);

    const rows = result.rows || result || [];
    const projectId = rows[0]?.id;

    if (!projectId) {
      return res.status(500).json({ ok: false, error: "Project creation failed" });
    }

    await db.execute(sql`
      insert into project_members (project_id, user_id, email, role, created_at)
      values (${projectId}, ${userId}, ${userEmail}, 'admin', now())
      on conflict (project_id, user_id) do nothing
    `);

    res.json({ ok: true, projectId });
  } catch (err: any) {
    console.error("[projects/create] error:", err);
    res.status(500).json({ ok: false, error: err.message || "Server error" });
  }
});
