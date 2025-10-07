import { Router } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { requireProject } from "../auth/projectAccess";

export const projectMembersRouter = Router();

projectMembersRouter.post("/add", requireProject("admin"), async (req, res, next) => {
  try {
    const { projectId, userId, email, role } = req.body || {};
    if (!projectId || !email) return res.status(400).json({ error: "projectId & email required" });
    
    // Fetch orgId from the project to ensure integrity
    const result: any = await db.execute(sql`SELECT org_id FROM projects WHERE id = ${projectId} LIMIT 1`);
    const rows = result.rows || result;
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: "project not found" });
    }
    const orgId = rows[0].org_id;
    
    await db.execute(sql`
      INSERT INTO project_members (org_id, project_id, user_id, email, role)
      VALUES (${orgId}, ${projectId}, ${userId ?? email}, ${email}, ${role ?? "member"})
      ON CONFLICT (org_id, project_id, user_id) DO UPDATE SET role = ${role ?? "member"}
    `);
    
    res.json({ ok: true });
  } catch (e) { 
    next(e); 
  }
});

projectMembersRouter.get("/list", requireProject("member"), async (req, res, next) => {
  try {
    const projectId = req.query.projectId as string;
    if (!projectId) return res.status(400).json({ error: "projectId required" });
    
    const result: any = await db.execute(sql`
      SELECT user_id as "userId", email, role, created_at as "createdAt"
      FROM project_members 
      WHERE project_id = ${projectId}
      ORDER BY created_at DESC
    `);
    
    const rows = result.rows || result;
    res.json({ ok: true, items: rows || [] });
  } catch (e) { 
    next(e); 
  }
});

projectMembersRouter.post("/remove", requireProject("admin"), async (req, res, next) => {
  try {
    const { projectId, userId } = req.body || {};
    if (!projectId || !userId) return res.status(400).json({ error: "projectId & userId required" });
    
    // Fetch orgId from the project to ensure integrity
    const result: any = await db.execute(sql`SELECT org_id FROM projects WHERE id = ${projectId} LIMIT 1`);
    const rows = result.rows || result;
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: "project not found" });
    }
    const orgId = rows[0].org_id;
    
    await db.execute(sql`
      DELETE FROM project_members 
      WHERE org_id = ${orgId} AND project_id = ${projectId} AND user_id = ${userId}
    `);
    
    res.json({ ok: true });
  } catch (e) { 
    next(e); 
  }
});

projectMembersRouter.post("/bootstrap", async (req, res, next) => {
  try {
    const { projectId } = req.body || {};
    if (!projectId) return res.status(400).json({ error: "projectId required" });
    
    const reqUser = (req as any).user;
    const userEmail = reqUser?.email;
    const userId = reqUser?.sub || userEmail;
    
    if (!userEmail) {
      return res.status(401).json({ error: "authentication required" });
    }
    
    const result: any = await db.execute(sql`SELECT org_id FROM projects WHERE id = ${projectId} LIMIT 1`);
    const rows = result.rows || result;
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: "project not found" });
    }
    const orgId = rows[0].org_id;
    
    await db.execute(sql`
      INSERT INTO project_members (org_id, project_id, user_id, email, role)
      VALUES (${orgId}, ${projectId}, ${userId}, ${userEmail}, 'admin')
      ON CONFLICT (org_id, project_id, user_id) DO UPDATE SET role = 'admin'
    `);
    
    res.json({ ok: true, promoted: userEmail });
  } catch (e) { 
    next(e); 
  }
});
