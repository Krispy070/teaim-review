import { Router } from "express";
import archiver from "archiver";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { requireProject } from "../auth/projectAccess";
import fs from "node:fs";
import path from "node:path";
import fetch from "node-fetch";

export const sdetail = Router();

/* GET /api/ma/separations/:id/detail?projectId= */
sdetail.get("/:id/detail", requireProject("member"), async (req,res)=>{
  const eid = String(req.params.id||""); const pid = String(req.query.projectId||"");
  const event = (await db.execute(
    sql`select id, cohort_id as "cohortId", title, type, scheduled_at as "scheduledAt", status, created_at as "createdAt"
       from separation_events where id=${eid} and project_id=${pid}`
  )).rows?.[0] || null;
  if (!event) return res.status(404).json({ error:"not found" });

  const cohort = event.cohortId ? (await db.execute(
    sql`select id, name, type, description from cohorts where id=${event.cohortId}`
  )).rows?.[0] : null;

  const members = event.cohortId ? (await db.execute(
    sql`select external_id as "externalId", name, email, org_unit as "orgUnit"
       from cohort_members where cohort_id=${event.cohortId} limit 2000`
  )).rows || [] : [];

  const tasks = (await db.execute(
    sql`select id, title, owner, due_at as "dueAt", status, plan_task_id as "planTaskId", created_at as "createdAt"
       from separation_tasks where event_id=${eid} order by created_at asc`
  )).rows || [];

  res.json({ ok:true, event, cohort, membersCount: members.length, tasks });
});

/* POST /api/ma/separations/:id/task/upsert  { projectId, id?, title, owner?, dueAt?, status? } */
sdetail.post("/:id/task/upsert", requireProject("member"), async (req,res)=>{
  const eid = String(req.params.id||""); const { projectId, id, title, owner, dueAt, status } = req.body||{};
  if (!projectId || !eid || (!id && !title)) return res.status(400).json({ error:"projectId & title (or id)" });

  if (id){
    await db.execute(
      sql`update separation_tasks set title=coalesce(${title},title), owner=coalesce(${owner},owner),
         due_at=coalesce(${dueAt},due_at), status=coalesce(${status},status)
       where id=${id} and project_id=${projectId}`
    );
  } else {
    await db.execute(
      sql`insert into separation_tasks (project_id, event_id, title, owner, due_at)
       values (${projectId},${eid},${title},${owner||null},${dueAt||null})`
    );
  }
  res.json({ ok:true });
});

/* POST /api/ma/separations/:id/status { projectId, status } */
sdetail.post("/:id/status", requireProject("member"), async (req,res)=>{
  const eid = String(req.params.id||""); const { projectId, status } = req.body||{};
  if (!projectId || !status) return res.status(400).json({ error:"projectId & status" });
  await db.execute(sql`update separation_events set status=${status} where id=${eid} and project_id=${projectId}`);

  // notify channel
  await fetch(`http://localhost:${process.env.PORT||5000}/api/messaging/post`, {
    method:"POST", headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ projectId, category:"plan", text: `Separation event "${eid}" marked ${status}` })
  }).catch(()=>{});
  res.json({ ok:true });
});

/* GET /api/ma/separations/:id/export.zip?projectId= */
sdetail.get("/:id/export.zip", requireProject("member"), async (req,res)=>{
  const eid = String(req.params.id||""); const pid = String(req.query.projectId||"");
  const ev = (await db.execute(
    sql`select e.id, e.title, e.type, e.scheduled_at as "scheduledAt", c.name as "cohortName", c.type as "cohortType"
       from separation_events e left join cohorts c on c.id=e.cohort_id
      where e.id=${eid} and e.project_id=${pid}`
  )).rows?.[0];
  if (!ev) return res.status(404).send("Not found");

  // prepare response
  res.setHeader("Content-Type","application/zip");
  res.setHeader("Content-Disposition",`attachment; filename="divestiture_${ev.id}.zip"`);
  const arc = archiver("zip", { zlib:{ level:9 } });
  arc.pipe(res);

  // summary
  const html = `<!doctype html><html><meta charset="utf-8"><title>Divestiture Packet</title>
  <body><h2>${ev.title} (${ev.type})</h2>
  <p>Cohort: ${ev.cohortName||"-"} (${ev.cohortType||"-"})</p>
  <p>Scheduled: ${ev.scheduledAt ? new Date(String(ev.scheduledAt)).toLocaleString() : "-"}</p>
  </body></html>`;
  const tmp = path.join("/tmp", `sep_${ev.id}.html`); fs.writeFileSync(tmp, html);
  arc.file(tmp, { name:"summary.html" });

  // tasks CSV
  const tasks = (await db.execute(
    sql`select title, owner, due_at as "dueAt", status from separation_tasks where event_id=${eid}`
  )).rows || [];
  const esc=(v:any)=>`"${String(v??"").replace(/"/g,'""')}"`;
  arc.append(["title,owner,due_at,status", ...tasks.map((t:any)=>[t.title,t.owner||"",t.dueAt||"",t.status||""].map(esc).join(","))].join("\r\n"), { name:"tasks.csv" });

  // cohort CSV (metadata only)
  const cohortMembers = (await db.execute(
    sql`select external_id as "externalId", name, email, org_unit as "orgUnit" from cohort_members
      where cohort_id = (select cohort_id from separation_events where id=${eid})`
  )).rows || [];
  arc.append(["external_id,name,email,org_unit", ...cohortMembers.map((m:any)=>[m.externalId||"",m.name||"",m.email||"",m.orgUnit||""].map(esc).join(","))].join("\r\n"), { name:"cohort.csv" });

  await arc.finalize();
});

export default sdetail;
