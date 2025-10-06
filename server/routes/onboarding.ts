import { Router } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { requireProject } from "../auth/projectAccess";
import fetch from "node-fetch";

export const onb = Router();

/* ---- Seed the 9 steps if missing ---- */
// POST /api/onboarding/seed  { projectId }
onb.post("/seed", requireProject("member"), async (req,res)=>{
  const { projectId } = req.body||{};
  if (!projectId) return res.status(400).json({ error:"projectId required" });

  const now = new Date().toISOString();
  const steps = [
    { key:"metrics",       title:"Metrics for Success", order: 0 },
    { key:"mindset",       title:"Team Mindset & Ownership", order: 1 },
    { key:"tech",          title:"Technology & Platforms", order: 2 },
    { key:"integrations",  title:"Integrations Planning", order: 3 },
    { key:"training",      title:"Training & Enablement", order: 4 },
    { key:"testing",       title:"Testing Strategy", order: 5 },
    { key:"data_reports",  title:"Data & Reporting", order: 6 },
    { key:"financials",    title:"Financials / Cost", order: 7 },
    { key:"ocm",           title:"OCM / Comms", order: 8 },
    { key:"logistics",     title:"Logistics & Cadences", order: 9 },
  ];
  for (const s of steps) {
    await db.execute(
      sql`insert into onboarding_steps (project_id, key, title, status, order_index)
       select ${projectId},${s.key},${s.title},'active',${s.order}
       where not exists (select 1 from onboarding_steps where project_id=${projectId} and key=${s.key})`
    );
  }
  // helpful default tasks
  await db.execute(
    sql`insert into onboarding_tasks (project_id, step_id, title, status)
     select ${projectId}, id, 'Define "Go/No-Go" criteria','planned' from onboarding_steps where project_id=${projectId} and key='metrics'
     on conflict do nothing`
  );
  await db.execute(
    sql`insert into onboarding_tasks (project_id, step_id, title, status)
     select ${projectId}, id, 'Team "Mindset" kickoff','planned' from onboarding_steps where project_id=${projectId} and key='mindset'
     on conflict do nothing`
  );
  res.json({ ok:true });
});

/* ---- Fetch page ---- */
// GET /api/onboarding?projectId=
onb.get("/", requireProject("member"), async (req,res)=>{
  const pid = String(req.query.projectId||"");
  const steps = (await db.execute(
    sql`select id, key, title, description, status, order_index as "orderIndex", created_at as "createdAt"
       from onboarding_steps where project_id=${pid} order by order_index asc`
  )).rows || [];
  // task counts per step
  const counts = (await db.execute(
    sql`select step_id as "stepId",
            sum(case when status='done' then 1 else 0 end)::int as done,
            count(*)::int as total
       from onboarding_tasks where project_id=${pid} group by step_id`
  )).rows || [];
  res.json({ ok:true, steps, counts });
});

/* ---- Tasks by step ---- */
// GET /api/onboarding/steps/:id/tasks?projectId=
onb.get("/steps/:id/tasks", requireProject("member"), async (req,res)=>{
  const sid = String(req.params.id||"");
  const pid = String(req.query.projectId||"");
  const tasks = (await db.execute(
    sql`select id, title, owner, due_at as "dueAt", status, notes, created_at as "createdAt"
       from onboarding_tasks where step_id=${sid} and project_id=${pid} order by created_at asc`
  )).rows || [];
  res.json({ ok:true, items: tasks });
});

/* ---- Upserts ---- */
// POST /api/onboarding/task/upsert  { projectId, stepId, id?, title, owner?, dueAt?, status?, notes? }
onb.post("/task/upsert", requireProject("member"), async (req,res)=>{
  const { projectId, stepId, id, title, owner, dueAt, status, notes } = req.body||{};
  if (!projectId || !stepId || (!id && !title)) return res.status(400).json({ error:"projectId, stepId, title (or id)" });
  if (id){
    await db.execute(
      sql`update onboarding_tasks set title=coalesce(${title||null},title), owner=coalesce(${owner||null},owner), due_at=coalesce(${dueAt||null},due_at),
                                   status=coalesce(${status||null},status), notes=coalesce(${notes||null},notes)
         where id=${id} and project_id=${projectId}`
    );
  } else {
    await db.execute(
      sql`insert into onboarding_tasks (project_id, step_id, title, owner, due_at, status, notes)
       values (${projectId},${stepId},${title},${owner||null},${dueAt||null},${status||'planned'},${notes||null})`
    );
  }
  res.json({ ok:true });
});

/* ---- Mark step done ---- */
// POST /api/onboarding/steps/:id/complete { projectId }
onb.post("/steps/:id/complete", requireProject("member"), async (req,res)=>{
  const { projectId } = req.body||{}; const sid = String(req.params.id||"");
  if (!projectId) return res.status(400).json({ error:"projectId" });

  // mark done
  await db.execute(sql`update onboarding_steps set status='done' where id=${sid} and project_id=${projectId}`);
  await db.execute(
    sql`insert into notifications (project_id, type, payload, is_read) values (${projectId},'onboarding_step_done',${JSON.stringify({ stepId: sid })},false)`
  );

  // fetch step title for the message
  const s = (await db.execute(
    sql`select title from onboarding_steps where id=${sid}`
  )).rows?.[0];

  // post to project's "onboarding" category channel
  await fetch(`http://localhost:${process.env.PORT||5000}/api/messaging/post`, {
    method:"POST", headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ projectId, category:"onboarding", text: `Onboarding step completed: ${s?.title||sid}` })
  }).catch(()=>{});

  res.json({ ok:true });
});

/* ---- Tech profile ---- */
// GET /api/onboarding/tech?projectId=
onb.get("/tech", requireProject("member"), async (req,res)=>{
  const pid = String(req.query.projectId||"");
  const row = (await db.execute(
    sql`select project_id as "projectId", productivity, chat, issues, storage, notes, updated_at as "updatedAt"
       from project_tech_profile where project_id=${pid}`
  )).rows?.[0] || null;
  res.json({ ok:true, profile: row });
});
// POST /api/onboarding/tech { projectId, productivity, chat, issues, storage, notes }
onb.post("/tech", requireProject("member"), async (req,res)=>{
  const { projectId, productivity, chat, issues, storage, notes } = req.body||{};
  if (!projectId) return res.status(400).json({ error:"projectId" });
  await db.execute(
    sql`insert into project_tech_profile (project_id, productivity, chat, issues, storage, notes, updated_at)
     values (${projectId},${productivity||null},${chat||null},${issues||null},${storage||null},${notes||null}, now())
     on conflict (project_id) do update set productivity=${productivity||null}, chat=${chat||null}, issues=${issues||null}, storage=${storage||null}, notes=${notes||null}, updated_at=now()`
  );
  res.json({ ok:true });
});

/* ---- Reflections (mindset) ---- */
// GET /api/onboarding/reflections?projectId=&limit=20
onb.get("/reflections", requireProject("member"), async (req,res)=>{
  const pid = String(req.query.projectId||""); const lim = Math.min(100, Math.max(1, Number(req.query.limit||"20")));
  const { rows } = await db.execute(
    sql`select id, prompt_at as "promptAt", author, content, created_at as "createdAt"
       from onboarding_reflections where project_id=${pid} order by created_at desc limit ${lim}`
  );
  res.json({ ok:true, items: rows||[] });
});
// POST /api/onboarding/reflections { projectId, author?, content }
onb.post("/reflections", requireProject("member"), async (req,res)=>{
  const { projectId, author, content } = req.body||{};
  if (!projectId || !content) return res.status(400).json({ error:"projectId & content" });
  await db.execute(sql`insert into onboarding_reflections (project_id, prompt_at, author, content) values (${projectId}, now(), ${author||null}, ${content})`);
  res.json({ ok:true });
});

/* ---- Push to Plan ---- */
// POST /api/onboarding/push-to-plan  { projectId, stepId, planId? }
onb.post("/push-to-plan", requireProject("member"), async (req,res)=>{
  const { projectId, stepId, planId=null } = req.body||{};
  if (!projectId || !stepId) return res.status(400).json({ error:"projectId & stepId" });

  const plan = planId ? { id: planId } : (await db.execute(
    sql`select id from project_plans where project_id=${projectId} and is_active=true order by created_at desc limit 1`
  )).rows?.[0];
  if (!plan) return res.status(400).json({ error:"no active plan" });

  const tasks = (await db.execute(
    sql`select title, owner, due_at as "dueAt" from onboarding_tasks where step_id=${stepId} and status<>'done'`
  )).rows || [];

  let created=0; let order=0;
  for (const t of tasks) {
    await db.execute(
      sql`insert into plan_tasks (project_id, plan_id, title, owner, start_at, due_at, status, priority, order_index, source, origin_type, origin_id)
       values (${projectId},${plan.id},${t.title},${t.owner||null},null,${t.dueAt||null},'planned',50,${order++},'onboarding','onboarding',${stepId})`
    );
    created++;
  }
  
  await db.execute(
    sql`insert into onboarding_push_log (project_id, step_id, plan_id, pushed_count)
     values (${projectId},${stepId},${plan.id},${created})`
  );
  
  const url = `http://localhost:${process.env.PORT||5000}/api/messaging/post`;
  await fetch(url, {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({
      projectId, category: "onboarding",
      text: `Onboarding → Plan: pushed ${created} task(s) from step ${stepId} into active plan (Plan ${plan.id}).`
    })
  }).catch(()=>{});
  
  res.json({ ok:true, created, planId: plan.id });
});

/* ---- Metrics for Success ---- */
// GET /api/onboarding/metrics?projectId=
onb.get("/metrics", requireProject("member"), async (req,res)=>{
  const pid = String(req.query.projectId||"");
  const rows = (await db.execute(
    sql`select id, name, owner, target, current, due_at as "dueAt", status, created_at as "createdAt"
       from onboarding_metrics where project_id=${pid} order by created_at desc`
  )).rows || [];
  res.json({ ok:true, items: rows });
});

// POST /api/onboarding/metrics/upsert { projectId, id?, name, owner?, target?, current?, dueAt?, status? }
onb.post("/metrics/upsert", requireProject("member"), async (req,res)=>{
  const { projectId, id, name, owner, target, current, dueAt, status } = req.body||{};
  if (!projectId || (!id && !name)) return res.status(400).json({ error:"projectId & name (or id)" });
  if (id){
    const updates = [];
    if (name !== undefined) updates.push(sql`name=${name}`);
    if (owner !== undefined) updates.push(sql`owner=${owner}`);
    if (target !== undefined) updates.push(sql`target=${target}`);
    if (current !== undefined) updates.push(sql`current=${current}`);
    if (dueAt !== undefined) updates.push(sql`due_at=${dueAt}`);
    if (status !== undefined) updates.push(sql`status=${status}`);
    
    if (updates.length > 0) {
      const updateSql = sql`update onboarding_metrics set `;
      for (let i = 0; i < updates.length; i++) {
        updateSql.append(updates[i]);
        if (i < updates.length - 1) updateSql.append(sql`, `);
      }
      updateSql.append(sql` where id=${id} and project_id=${projectId}`);
      await db.execute(updateSql);
    }
  } else {
    await db.execute(
      sql`insert into onboarding_metrics (project_id, name, owner, target, current, due_at, status)
       values (${projectId},${name},${owner||null},${target||null},${current||null},${dueAt||null},${status||'tracking'})`
    );
  }
  res.json({ ok:true });
});

export default onb;
