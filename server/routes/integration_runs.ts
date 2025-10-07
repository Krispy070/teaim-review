import { Router } from "express";
import { db } from "../db/client";
import { requireProject } from "../auth/projectAccess";
import { sql } from "drizzle-orm";

export const runs = Router();

// GET /api/ma/runs?projectId=&integrationId=&limit=20&offset=0
runs.get("/", requireProject("member"), async (req,res)=>{
  const pid = String(req.query.projectId||"");
  const integ = String(req.query.integrationId||"");
  const limit = Math.min(100, Math.max(1, Number(req.query.limit||"20")));
  const offset= Math.max(0, Number(req.query.offset||"0"));
  const where = [`project_id=$1`]; const params:any[]=[pid];
  if (integ){ where.push(`integration_id=$${params.length+1}`); params.push(integ); }
  const { rows } = await db.execute(
    `select id, integration_id as "integrationId", planned_at as "plannedAt", started_at as "startedAt",
            finished_at as "finishedAt", status, duration_ms as "durationMs", note, created_at as "createdAt"
       from integration_runs
      where ${where.join(" and ")}
      order by coalesce(finished_at, created_at) desc
      limit ${limit} offset ${offset}`, params as any
  );
  res.json({ ok:true, items: rows||[], meta:{ limit, offset } });
});

runs.post("/:id/mark", requireProject("member"), async (req,res)=>{
  const id = String(req.params.id||"");
  const { status, note, projectId } = req.body || {};
  if (!projectId) return res.status(400).json({ error:"projectId required" });
  if (!["success","failed","running"].includes(status||"")) return res.status(400).json({ error:"bad status" });
  
  const { rows: existing } = await db.execute(sql.raw(`select id from integration_runs where id=$1 and project_id=$2 limit 1`), [id, projectId] as any);
  if (!existing?.length) return res.status(404).json({ error:"run not found or access denied" });
  
  const set: string[] = ["updated_at=now()"];
  const params: any[] = [];
  if (status==="running"){ set.push(`started_at=coalesce(started_at, now())`); }
  if (status==="success"){ set.push(`finished_at=now(), duration_ms = extract(epoch from (now() - started_at))*1000`); }
  set.push(`status=$1`); params.push(status);
  if (note!=null){ set.push(`note=$${params.length+1}`); params.push(note); }
  params.push(id);
  await db.execute(sql.raw(`update integration_runs set ${set.join(", ")} where id=$${params.length}`));
  res.json({ ok:true });
});

runs.post("/trigger", requireProject("member"), async (req,res)=>{
  const { projectId, integrationId } = req.body || {};
  if (!projectId || !integrationId) return res.status(400).json({ error:"projectId & integrationId required" });
  await db.execute(sql.raw(
    `insert into integration_runs (project_id, integration_id, planned_at, status) values ($1,$2, now(), 'planned')`
  ), [projectId, integrationId] as any);
  res.json({ ok:true });
});

runs.post("/retry", requireProject("member"), async (req,res)=>{
  const { runId } = req.body||{};
  if (!runId) return res.status(400).json({ error:"runId required" });
  await db.execute(
    sql`update integration_runs set status='planned', planned_at=now(), note=null where id=${runId}`
  );
  res.json({ ok:true });
});
