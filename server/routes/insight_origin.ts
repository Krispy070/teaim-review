import { Router } from "express";
import { db } from "../db/client";
import { requireProject } from "../auth/projectAccess";
import { sql } from "drizzle-orm";

export const origin = Router();

/** GET /api/origin/info?type=doc|conversation|meeting&id=UUID */
origin.get("/info", requireProject("member"), async (req, res) => {
  const type = String(req.query.type || "");
  const id = String(req.query.id || "");
  if (!type || !id) return res.status(400).json({ error: "type & id required" });
  
  if (type === "doc") {
    const r = await db.execute(sql`select id, name, created_at as "createdAt" from docs where id=${id}`);
    return res.json({ ok: true, item: r.rows?.[0] || null });
  }
  if (type === "conversation") {
    const r = await db.execute(sql`select id, title, source, created_at as "createdAt" from conversations where id=${id}`);
    return res.json({ ok: true, item: r.rows?.[0] || null });
  }
  if (type === "meeting") {
    const r = await db.execute(sql`select id, title, starts_at as "startsAt" from meetings where id=${id}`);
    return res.json({ ok: true, item: r.rows?.[0] || null });
  }
  res.status(400).json({ error: "unsupported type" });
});

export default origin;
