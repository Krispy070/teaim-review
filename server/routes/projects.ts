import { Router } from "express";
import { db } from "../db/client";
import { requireRole } from "../auth/supabaseAuth";
import { sql } from "drizzle-orm";

export const projects = Router();

projects.get("/mine", requireRole("member"), async (req, res, next) => {
  try {
    const userId = (req as any).user?.id;
    const email = (req as any).user?.email || "";
    
    if (!email) {
      return res.json({ ok: true, items: [] });
    }

    const { rows } = await db.execute(sql`
      SELECT DISTINCT p.id, p.name, p.code
      FROM projects p
      JOIN project_members m ON m.project_id = p.id
      WHERE m.email = ${email}
      ORDER BY p.created_at DESC NULLS LAST, p.name ASC
    `);
    
    res.json({ ok: true, items: rows || [] });
  } catch (e) { 
    next(e); 
  }
});
