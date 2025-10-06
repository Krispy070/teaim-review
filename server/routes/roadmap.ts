import { Router } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { requireProject } from "../auth/projectAccess";
import { logAudit } from "../lib/audit";

export const roadmap = Router();

/* ---------- Helpers ---------- */
function detectModule(s:string){
  const x = (s||"").toLowerCase();
  if (/payroll/.test(x)) return "Payroll";
  if (/\b(absence|leave)\b/.test(x)) return "Absence";
  if (/\b(time|time\-tracking)\b/.test(x)) return "Time";
  if (/\bbenefit(s)?\b/.test(x)) return "Benefits";
  if (/\b(fin(ance)?|gl|ap|ar)\b/.test(x)) return "FIN";
  if (/\bsecurity|role(s)?\b/.test(x)) return "Security";
  if (/\bintegration(s)?|interface(s)?\b/.test(x)) return "Integrations";
  if (/\bhcm|core hr|workday platform\b/.test(x)) return "HCM";
  return "Custom";
}

/* ---------- Phases ---------- */
roadmap.get("/phases", requireProject("member"), async (req,res)=>{
  const pid = String(req.query.projectId||"");
  const { rows } = await db.execute(
    sql`select id, title, description, starts_at as "startsAt", ends_at as "endsAt", status, order_index as "orderIndex", created_at as "createdAt"
       from roadmap_phases where project_id=${pid} order by order_index asc, created_at asc`
  );
  res.json({ ok:true, items: rows||[] });
});

roadmap.post("/phases/upsert", requireProject("member"), async (req,res)=>{
  const { projectId, id, title, description, startsAt, endsAt, status } = req.body||{};
  if (!projectId || !title && !id) return res.status(400).json({ error:"projectId & title (or id) required" });
  if (id){
    await db.execute(
      sql`update roadmap_phases set title=coalesce(${title},title), description=coalesce(${description},description),
           starts_at=coalesce(${startsAt},starts_at), ends_at=coalesce(${endsAt},ends_at), status=coalesce(${status},status)
       where id=${id} and project_id=${projectId}`
    );
  } else {
    const max = await db.execute(sql`select coalesce(max(order_index),-1)+1 as o from roadmap_phases where project_id=${projectId}`);
    await db.execute(
      sql`insert into roadmap_phases (project_id, title, description, starts_at, ends_at, status, order_index)
       values (${projectId},${title},${description||null},${startsAt||null},${endsAt||null},${status||'planned'},${max.rows?.[0]?.o||0})`
    );
  }
  res.json({ ok:true });
});

roadmap.post("/phases/reorder", requireProject("member"), async (req,res)=>{
  const { projectId, ids=[] } = req.body||{};
  if (!projectId || !Array.isArray(ids)) return res.status(400).json({ error:"projectId & ids[]" });
  let i=0; for (const id of ids) {
    await db.execute(sql`update roadmap_phases set order_index=${i++} where id=${id} and project_id=${projectId}`);
  }
  res.json({ ok:true });
});

roadmap.post("/phases/:id/activate", requireProject("member"), async (req,res)=>{
  const id = String(req.params.id||"");
  const { projectId } = req.body||{};
  if (!projectId || !id) return res.status(400).json({ error:"projectId & id" });

  const result = await db.execute(
    sql`update roadmap_phases set status='active' where id=${id} and project_id=${projectId} returning (select org_id from projects where projects.id=${projectId}) as org_id`
  );
  
  if (!result.rowCount || result.rowCount === 0) {
    return res.status(404).json({ error:"Phase not found or access denied" });
  }

  const orgId = result.rows?.[0]?.org_id;
  if (!orgId) return res.status(500).json({ error:"Failed to retrieve org_id" });

  await db.execute(
    sql`update roadmap_phases set status=case when status='active' then 'planned' else status end where id<>${id} and project_id=${projectId}`
  );
  await db.execute(
    sql`insert into notifications (id, org_id, project_id, kind, payload, seen) values (gen_random_uuid(), ${orgId}, ${projectId}, 'roadmap_phase_activated', ${JSON.stringify({ phaseId:id })}, false)`
  );
  await logAudit(req as any, projectId, "update", "roadmap_phase", id, { action:"activate" });
  res.json({ ok:true });
});

roadmap.post("/phases/:id/complete", requireProject("member"), async (req,res)=>{
  const id = String(req.params.id||"");
  const { projectId } = req.body||{};
  if (!projectId || !id) return res.status(400).json({ error:"projectId & id" });

  const result = await db.execute(
    sql`update roadmap_phases set status='done', ends_at=coalesce(ends_at, now()) where id=${id} and project_id=${projectId} returning (select org_id from projects where projects.id=${projectId}) as org_id, order_index`
  );

  if (!result.rowCount || result.rowCount === 0) {
    return res.status(404).json({ error:"Phase not found or access denied" });
  }

  const orgId = result.rows?.[0]?.org_id;
  if (!orgId) return res.status(500).json({ error:"Failed to retrieve org_id" });

  const set = await db.execute(
    sql`select coalesce(roadmap_auto_activate_next,false) as on from project_settings where project_id=${projectId}`
  );
  const doit = !!set.rows?.[0]?.on;
  let autoActivatedId: string | null = null;
  
  if (doit) {
    const currentOrder = result.rows?.[0]?.order_index as number;
    const next = await db.execute(
      sql`select id from roadmap_phases where project_id=${projectId} and status<>'done' and order_index > ${currentOrder} order by order_index asc limit 1`
    );
    if (next.rows?.length) {
      autoActivatedId = next.rows[0].id as string;
      await db.execute(
        sql`update roadmap_phases set status='active' where id=${autoActivatedId}`
      );
      await db.execute(
        sql`update roadmap_phases set status='planned' where project_id=${projectId} and status='active' and id<>${autoActivatedId}`
      );
      await db.execute(
        sql`insert into notifications (id, org_id, project_id, kind, payload, seen) values (gen_random_uuid(), ${orgId}, ${projectId}, 'roadmap_phase_activated', ${JSON.stringify({ phaseId: autoActivatedId, auto:true })}, false)`
      );
    }
  }

  await db.execute(
    sql`insert into notifications (id, org_id, project_id, kind, payload, seen) values (gen_random_uuid(), ${orgId}, ${projectId}, 'roadmap_phase_completed', ${JSON.stringify({ phaseId:id })}, false)`
  );
  await logAudit(req as any, projectId, "update", "roadmap_phase", id, { action:"complete" });
  res.json({ ok:true, autoActivated: doit, autoActivatedId });
});

roadmap.get("/phases/progress", requireProject("member"), async (req,res)=>{
  const pid = String(req.query.projectId||"");
  const { rows } = await db.execute(
    sql`select phase_id as "phaseId",
            sum(case when status='done' then 1 else 0 end)::int as done,
            count(*)::int as total
       from roadmap_items where project_id=${pid}
       group by phase_id`
  );
  res.json({ ok:true, items: rows||[] });
});

/* ---------- Items ---------- */
roadmap.get("/items", requireProject("member"), async (req,res)=>{
  const pid = String(req.query.projectId||"");
  const phaseId = String(req.query.phaseId||"");
  const module = String(req.query.module||"");
  const status = String(req.query.status||"");
  const q = String(req.query.q||"").toLowerCase();
  const limitRaw = Number.parseInt(String(req.query.limit||"30"), 10);
  const offsetRaw = Number.parseInt(String(req.query.offset||"0"), 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, limitRaw)) : 30;
  const offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0;

  let baseQuery = sql`select id, phase_id as "phaseId", title, module, description, status, priority, tags, origin_type as "originType", origin_id as "originId", order_index as "orderIndex", created_at as "createdAt"
     from roadmap_items where project_id=${pid}`;
  
  if (phaseId) baseQuery = sql`${baseQuery} and phase_id = ${phaseId}`;
  if (module) baseQuery = sql`${baseQuery} and module = ${module}`;
  if (status) baseQuery = sql`${baseQuery} and status = ${status}`;
  if (q) baseQuery = sql`${baseQuery} and (lower(title) like ${'%'+q+'%'} or lower(description) like ${'%'+q+'%'})`;
  
  baseQuery = sql`${baseQuery} order by order_index asc, priority asc, created_at asc limit ${limit} offset ${offset}`;

  const { rows } = await db.execute(baseQuery);
  res.json({ ok:true, items: rows||[], meta:{ limit, offset } });
});

roadmap.post("/items/upsert", requireProject("member"), async (req,res)=>{
  const { projectId, id, ...b } = req.body||{};
  if (!projectId) return res.status(400).json({ error:"projectId required" });
  if (id){
    await db.execute(
      sql`update roadmap_items set
         phase_id=coalesce(${b.phaseId||null},phase_id), title=coalesce(${b.title||null},title), module=coalesce(${b.module||null},module),
         description=coalesce(${b.description||null},description), status=coalesce(${b.status||null},status), priority=coalesce(${b.priority||null},priority),
         tags=coalesce(${JSON.stringify(b.tags||null)},tags), origin_type=coalesce(${b.originType||null},origin_type), origin_id=coalesce(${b.originId||null},origin_id)
       where id=${id} and project_id=${projectId}`
    );
  } else {
    const max = await db.execute(
      sql`select coalesce(max(order_index),-1)+1 as o from roadmap_items where project_id=${projectId} and phase_id is not distinct from ${b.phaseId||null}`
    );
    await db.execute(
      sql`insert into roadmap_items (project_id, phase_id, title, module, description, status, priority, tags, origin_type, origin_id, source, order_index)
       values (${projectId},${b.phaseId||null},${b.title},${b.module||detectModule(b.title||"")},${b.description||null},${b.status||'backlog'},${b.priority||50},${JSON.stringify(b.tags||[])},${b.originType||null},${b.originId||null},${b.source||'manual'},${max.rows?.[0]?.o||0})`
    );
  }
  res.json({ ok:true });
});

roadmap.post("/items/reorder", requireProject("member"), async (req,res)=>{
  const { projectId, phaseId=null, ids=[] } = req.body||{};
  if (!projectId || !Array.isArray(ids)) return res.status(400).json({ error:"projectId & ids[]" });
  let i=0; for (const id of ids) {
    if (phaseId !== null) {
      await db.execute(
        sql`update roadmap_items set order_index=${i++} where id=${id} and project_id=${projectId} and phase_id=${phaseId}`
      );
    } else {
      await db.execute(
        sql`update roadmap_items set order_index=${i++} where id=${id} and project_id=${projectId} and phase_id is null`
      );
    }
  }
  res.json({ ok:true });
});

/* ---------- Tiles (module order) ---------- */
roadmap.get("/tiles", requireProject("member"), async (req,res)=>{
  const pid = String(req.query.projectId||"");

  // modules in active/planned phases (in phase order), then modules only in done phases
  const phases = (await db.execute(
    sql`select id, status from roadmap_phases where project_id=${pid} order by order_index asc`
  )).rows || [];
  const idsActive = phases.filter((p:any)=>p.status!=='done').map((p:any)=>p.id);
  const idsDone   = phases.filter((p:any)=>p.status==='done').map((p:any)=>p.id);

  let modsActive:any[] = [];
  if (idsActive.length > 0) {
    const placeholders = idsActive.map((_:any, i:number) => sql`$${i+2}`);
    modsActive = (await db.execute(
      sql`select distinct module from roadmap_items where project_id=${pid} and module is not null and phase_id in (${sql.join(idsActive.map(id => sql`${id}`), sql`, `)})`
    )).rows.map((r:any)=>r.module);
  }

  let modsDone:any[] = [];
  if (idsDone.length > 0) {
    modsDone = (await db.execute(
      sql`select distinct module from roadmap_items where project_id=${pid} and module is not null and (phase_id in (${sql.join(idsDone.map(id => sql`${id}`), sql`, `)}) or phase_id is null)`
    )).rows.map((r:any)=>r.module);
  }

  const order = Array.from(new Set([...modsActive, ...modsDone]));
  res.json({ ok:true, tiles: order });
});

/* ---------- Generate from insights (last 14 days) ---------- */
roadmap.post("/generate", requireProject("member"), async (req,res)=>{
  const { projectId, intoPhaseId=null, days=14 } = req.body||{};
  if (!projectId) return res.status(400).json({ error:"projectId required" });

  const recentActs = (await db.execute(
    sql`select id, title, assignee, due_at as "dueAt", origin_type as "originType", origin_id as "originId"
       from actions where project_id=${projectId} and created_at >= now() - (${String(days)} || ' days')::interval
       order by created_at desc limit 200`
  )).rows || [];

  let created=0;
  for (const a of recentActs) {
    const module = detectModule(String(a.title||""));
    const exists = await db.execute(
      sql`select 1 from roadmap_items where project_id=${projectId} and lower(title)=lower(${a.title}) limit 1`
    );
    if (exists.rows?.length) continue;
    await db.execute(
      sql`insert into roadmap_items (project_id, phase_id, title, module, description, status, priority, origin_type, origin_id, source)
       values (${projectId},${intoPhaseId},${a.title},${module},${`Seeded from Action ${a.id}`},'planned',40,${a.originType||null},${a.originId||null},'generate')`
    );
    created++;
  }

  await logAudit(req as any, projectId, "create", "roadmap_generation", undefined, { created, days, phase: intoPhaseId });
  res.json({ ok:true, created });
});

/* ---------- Export CSV ---------- */
roadmap.get("/items/export.csv", requireProject("member"), async (req,res)=>{
  const pid = String(req.query.projectId||"");
  const phaseId = String(req.query.phaseId||"");
  const module = String(req.query.module||"");
  const status = String(req.query.status||"");
  const q = String(req.query.q||"").toLowerCase();

  let baseQuery = sql`select title, module, status, priority, origin_type as "originType", origin_id as "originId", created_at as "createdAt"
     from roadmap_items where project_id=${pid}`;
  
  if (phaseId) baseQuery = sql`${baseQuery} and phase_id = ${phaseId}`;
  if (module) baseQuery = sql`${baseQuery} and module = ${module}`;
  if (status) baseQuery = sql`${baseQuery} and status = ${status}`;
  if (q) baseQuery = sql`${baseQuery} and (lower(title) like ${'%'+q+'%'} or lower(description) like ${'%'+q+'%'})`;
  
  baseQuery = sql`${baseQuery} order by order_index asc, priority asc, created_at asc limit 5000`;

  const { rows } = await db.execute(baseQuery);
  const esc = (v:any)=>`"${String(v??"").replace(/"/g,'""')}"`;
  const lines = [
    "title,module,status,priority,originType,originId,createdAt",
    ...rows.map((r:any)=>[r.title,r.module||"",r.status,r.priority,r.originType||"",r.originId||"",r.createdAt].map(esc).join(","))
  ].join("\r\n");
  res.type("text/csv").send(lines);
});

/* ---------- Bulk operations ---------- */
roadmap.post("/items/bulk", requireProject("member"), async (req,res)=>{
  const { projectId, ids=[], set={} } = req.body||{};
  if (!projectId || !Array.isArray(ids) || !ids.length) return res.status(400).json({ error:"projectId & ids required" });
  
  const updates:any[] = [];
  if ("status" in set) updates.push(sql`status=${set.status}`);
  if ("priority" in set) updates.push(sql`priority=${set.priority}`);
  if ("phaseId" in set) updates.push(sql`phase_id=${set.phaseId}`);
  
  if (!updates.length) return res.json({ ok:true, updated:0 });
  
  updates.push(sql`updated_at=now()`);
  
  const updateClause = sql.join(updates, sql`, `);
  const result = await db.execute(
    sql`update roadmap_items set ${updateClause} where project_id=${projectId} and id in (${sql.join(ids.map(id => sql`${id}`), sql`, `)})`
  );
  
  res.json({ ok:true, updated: result.rowCount || 0 });
});

/* ---------- Bulk create tickets ---------- */
roadmap.post("/items/tickets", requireProject("member"), async (req,res)=>{
  const { projectId, ids=[] } = req.body||{};
  if (!projectId || !Array.isArray(ids) || !ids.length) return res.status(400).json({ error:"projectId & ids required" });

  let baseQuery = sql`select id, title, module, description, origin_type as "originType", origin_id as "originId"
     from roadmap_items where project_id=${projectId}`;
  
  if (ids.length > 0) {
    baseQuery = sql`${baseQuery} and id in (${sql.join(ids.map(id => sql`${id}`), sql`, `)})`;
  }

  const { rows } = await db.execute(baseQuery);

  let created=0;
  for (const it of rows||[]){
    const desc = `Roadmap: ${it.module||"Module"}\n\n${it.description||""}\n\nOrigin: ${it.originType||"-"} ${it.originId||""}`;
    await db.execute(
      sql`insert into tickets (project_id, source, source_id, title, description, status, priority)
       values (${projectId},'roadmap',${it.id},${it.title},${desc},'triage','med')`
    );
    created++;
  }
  res.json({ ok:true, created });
});

export default roadmap;
