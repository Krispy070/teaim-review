import { Router } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { requireProject } from "../auth/projectAccess";

export const announcements = Router();

// GET /api/announcements?projectId=
announcements.get("/", requireProject("member"), async (req, res) => {
  const pid = String(req.query.projectId || "");
  const rows = (await db.execute(
    sql`select id, project_id as "projectId", title, body, created_at as "createdAt"
        from announcements where project_id=${pid} order by created_at desc limit 100`
  )).rows || [];
  res.json({ ok: true, items: rows });
});

// POST /api/announcements/create  { projectId, title, body? }
announcements.post("/create", requireProject("member"), async (req, res) => {
  const { projectId, title, body } = req.body || {};
  if (!projectId || !title) {
    return res.status(400).json({ error: "projectId, title required" });
  }
  
  const r = await db.execute(
    sql`insert into announcements (project_id, title, body)
        values (${projectId}, ${title}, ${body || ""}) returning id`
  );
  res.json({ ok: true, id: r.rows?.[0]?.id });
});

export default announcements;
