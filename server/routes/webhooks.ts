import { Router } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { requireProject } from "../auth/projectAccess";

export const wh = Router();

wh.get("/list", requireProject("member"), async (req,res)=>{
  const pid = String(req.query.projectId||"");
  const { rows } = await db.execute(
    sql`select id, type, url, events, label, created_at as "createdAt" from webhooks where project_id=${pid} order by created_at desc`
  );
  res.json({ ok:true, items: rows||[] });
});

wh.post("/add", requireProject("member"), async (req,res)=>{
  const { projectId, type, url, events, label } = req.body||{};
  if (!projectId || !type || !url) return res.status(400).json({ error:"projectId, type, url required" });
  const eventsJson = JSON.stringify(events||["errors","queue","run_failed","run_success"]);
  await db.execute(
    sql`insert into webhooks (project_id, type, url, events, label) values (${projectId},${type},${url},${eventsJson},${label||null})`
  );
  res.json({ ok:true });
});

wh.delete("/:id", requireProject("member"), async (req,res)=>{
  const id = String(req.params.id||"");
  await db.execute(sql`delete from webhooks where id=${id}`);
  res.json({ ok:true });
});

wh.patch("/:id", requireProject("member"), async (req, res) => {
  const id = String(req.params.id || "");
  const { label, events } = req.body || {};
  
  const validEvents = ["errors", "queue", "run_failed", "run_success", "run_missed_sla", "training_upcoming", "cadence_upcoming", "daily_brief"];
  
  if (events !== undefined) {
    if (!Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: "events must be a non-empty array" });
    }
    const invalidEvents = events.filter((e: string) => !validEvents.includes(e));
    if (invalidEvents.length > 0) {
      return res.status(400).json({ error: `Invalid events: ${invalidEvents.join(", ")}` });
    }
  }
  
  if (label !== undefined && label !== null && (typeof label !== "string" || label.length > 200)) {
    return res.status(400).json({ error: "label must be a string with max 200 characters" });
  }
  
  const sets: string[] = [];
  const params: any[] = [];
  if (label !== undefined) { params.push(label || null); sets.push(`label = $${params.length}`); }
  if (events !== undefined) { params.push(JSON.stringify(events)); sets.push(`events = $${params.length}`); }
  if (sets.length === 0) return res.json({ ok: true });
  params.push(id);
  await db.execute(`update webhooks set ${sets.join(", ")} where id=$${params.length}`, params as any);
  res.json({ ok: true });
});
