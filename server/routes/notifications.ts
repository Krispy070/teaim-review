import { Router } from "express";
import { requireRole } from "../auth/supabaseAuth";
import { db } from "../db/client";
import { sql } from "drizzle-orm";

export const notif = Router();

notif.get("/count", requireRole("member"), async (req, res, next) => {
  try {
    const projectId = (req.query.projectId || req.query.project_id) as string;
    if (!projectId) return res.status(400).json({ error: "projectId required" });
    const result = await db.execute(
      sql`select count(*)::int as count from notifications where project_id = ${projectId} and is_read = false`
    );
    res.json({ ok: true, count: result.rows?.[0]?.count ?? 0 });
  } catch (e) { next(e); }
});

notif.get("/list", requireRole("member"), async (req, res, next) => {
  try {
    const projectId = (req.query.projectId || req.query.project_id) as string;
    if (!projectId) return res.status(400).json({ error: "projectId required" });
    const result = await db.execute(
      sql`select id, kind as type, payload, is_read as "isRead", created_at as "createdAt"
       from notifications
       where project_id = ${projectId}
       order by created_at desc
       limit 50`
    );
    res.json({ ok: true, items: result.rows || [] });
  } catch (e) { next(e); }
});

notif.post("/mark-all-read", requireRole("member"), async (req, res, next) => {
  try {
    const projectId = req.body?.projectId || req.body?.project_id || req.query?.projectId || req.query?.project_id;
    if (!projectId) return res.status(400).json({ error: "projectId required" });
    await db.execute(sql`update notifications set is_read = true where project_id = ${projectId}`);
    res.json({ ok: true });
  } catch (e) { next(e); }
});
