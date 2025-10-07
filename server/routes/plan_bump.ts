import { Router } from "express";
import { db } from "../db/client";
import { requireProject } from "../auth/projectAccess";
import { sql } from "drizzle-orm";
import { parseIntClamp } from "../lib/parse";

export const pbump = Router();

/* POST /api/plan/tasks/:id/bump  { projectId, days:int } */
pbump.post("/tasks/:id/bump", requireProject("member"), async (req,res)=>{
  const { projectId, days: rawDays } = req.body || {};
  const id = String(req.params.id || "");
  if (!projectId || !id) return res.status(400).json({ error: "projectId & id" });
  const days = parseIntClamp(rawDays, 1, 60, 1);

  const row = (await db.execute(
    sql`select due_at from plan_tasks where id=${id} and project_id=${projectId}`
  )).rows?.[0];
  const baseISO = (row?.due_at as string) || new Date().toISOString();
  const d = new Date(baseISO); d.setUTCDate(d.getUTCDate() + days);
  await db.execute(sql`update plan_tasks set due_at=${d.toISOString()}, updated_at=now() where id=${id}`);
  res.json({ ok:true, next: d.toISOString() });
});

export default pbump;
