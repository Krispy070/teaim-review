import { Router } from "express";
import crypto from "node:crypto";
import { db } from "../db/client";
import { requireProject } from "../auth/projectAccess";
import { sql } from "drizzle-orm";

export const tmb = Router();
const DOMAIN = process.env.MAILGUN_DOMAIN || "teaim.local";

tmb.get("/", requireProject("member"), async (req, res) => {
  const pid = String(req.query.projectId || "");
  const { rows } = await db.execute(
    sql`select id, address, created_at as "createdAt" from ticket_mailboxes where project_id=${pid}`
  );
  res.json({ ok: true, items: rows || [] });
});

tmb.post("/rotate", requireProject("member"), async (req, res) => {
  const { projectId, projectCode = "PROJ" } = req.body || {};
  if (!projectId) return res.status(400).json({ error: "projectId required" });
  
  const token = crypto.randomBytes(8).toString("hex");
  const slug = crypto.randomBytes(3).toString("hex");
  const addr = `tickets+${String(projectCode).replace(/[^A-Za-z0-9\-]/g, "")}.${slug}.${token}@${DOMAIN}`;
  
  await db.execute(
    sql`insert into ticket_mailboxes (project_id, address, token) values (${projectId}, ${addr}, ${token})`
  );
  
  res.json({ ok: true, address: addr });
});
