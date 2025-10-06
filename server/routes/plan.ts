import { Router } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { requireProject } from "../auth/projectAccess";
import OpenAI from "openai";

export const plan = Router();
const ai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

plan.get("/", requireProject("member"), async (req,res)=>{
  const pid = String(req.query.projectId||"");
  const planRow = (await db.execute(
    sql`select id, title, version, is_active, created_at as "createdAt"
       from project_plans where project_id=${pid} and is_active=true order by created_at desc limit 1`
  )).rows?.[0] || null;
  if (!planRow) return res.json({ ok:true, plan:null, tasks:[] });

  const tasks = (await db.execute(
    sql`select id, phase_id as "phaseId", title, module, description, owner, start_at as "startAt", due_at as "dueAt",
            status, priority, depends_on as "dependsOn", order_index as "orderIndex", source, origin_type as "originType", origin_id as "originId",
            action_id as "actionId", roadmap_item_id as "roadmapItemId", ticket_id as "ticketId",
            baseline_start_at as "baselineStart", baseline_due_at as "baselineDue"
       from plan_tasks where plan_id=${planRow.id} order by order_index asc, created_at asc`
  )).rows || [];
  res.json({ ok:true, plan: planRow, tasks });
});

plan.post("/create", requireProject("member"), async (req,res)=>{
  const { projectId, title } = req.body||{};
  if (!projectId || !title) return res.status(400).json({ error:"projectId & title" });
  await db.execute(sql`update project_plans set is_active=false where project_id=${projectId}`);
  const ins = await db.execute(
    sql`insert into project_plans (project_id, title, is_active) values (${projectId},${title},true) returning id`
  );
  res.json({ ok:true, planId: ins.rows?.[0]?.id });
});

plan.post("/tasks/upsert", requireProject("member"), async (req,res)=>{
  const { projectId, planId, tasks=[] } = req.body||{};
  if (!projectId || !planId || !Array.isArray(tasks)) return res.status(400).json({ error:"projectId, planId, tasks[]" });
  for (const t of tasks) {
    if (t.id) {
      await db.execute(
        sql`update plan_tasks set phase_id=${t.phaseId||null}, title=${t.title}, module=${t.module||detectModule(String(t.title||""))}, description=${t.description||null}, owner=${t.owner||null}, start_at=${t.startAt||null}, due_at=${t.dueAt||null},
                status=${t.status||'planned'}, priority=${Number(t.priority||50)}, depends_on=${JSON.stringify(t.dependsOn||[])}, order_index=${Number(t.orderIndex||0)}
           where id=${t.id} and project_id=${projectId}`
      );
    } else {
      const max = await db.execute(
        sql`select coalesce(max(order_index),-1)+1 as o from plan_tasks where project_id=${projectId} and plan_id=${planId}`
      );
      await db.execute(
        sql`insert into plan_tasks (project_id, plan_id, phase_id, title, module, description, owner, start_at, due_at, status, priority, depends_on, order_index, source, origin_type, origin_id)
         values (${projectId},${planId},${t.phaseId||null},${t.title},${t.module||detectModule(String(t.title||""))},${t.description||null},${t.owner||null},${t.startAt||null},${t.dueAt||null},${t.status||'planned'},${Number(t.priority||50)},${JSON.stringify(t.dependsOn||[])},${max.rows?.[0]?.o||0},${'manual'},${t.originType||null},${t.originId||null})`
      );
    }
  }
  res.json({ ok:true });
});

plan.post("/tasks/reorder", requireProject("member"), async (req,res)=>{
  const { projectId, planId, ids=[] } = req.body||{};
  if (!projectId || !planId || !Array.isArray(ids)) return res.status(400).json({ error:"projectId, planId, ids[]" });
  let i=0; 
  for (const id of ids) {
    await db.execute(sql`update plan_tasks set order_index=${i++} where id=${id} and project_id=${projectId}`);
  }
  res.json({ ok:true });
});

plan.post("/generate", requireProject("member"), async (req,res)=>{
  const { projectId, goLiveISO, modules=[], phases=[], lookbackDays=30 } = req.body||{};
  if (!projectId || !goLiveISO) return res.status(400).json({ error:"projectId & goLiveISO required" });

  const acts = (await db.execute(
    sql`select title, owner as assignee, due_date as "dueAt" from actions
      where project_id=${projectId} and created_at >= now() - (${String(lookbackDays)} || ' days')::interval
      order by created_at desc limit 50`
  )).rows||[];

  const tles = (await db.execute(
    sql`select title, type, starts_at as "startsAt" from timeline_events
      where project_id=${projectId} order by coalesce(starts_at, created_at) desc limit 30`
  )).rows||[];

  const sys = `You are a senior Workday program manager. Draft a realistic multi-phase project plan with tasks grouped by phase and module.
Each task: { title, module, owner?, startAt?, dueAt?, dependsOn?[] }.
Keep tasks concise and implementation-focused (config, conversion, testing, integrations, cutover).
`;
  const usr = `Go-Live: ${goLiveISO}
Modules: ${modules.join(", ") || "(detect from actions/timeline)"}
Known actions (last ${lookbackDays}d): ${acts.map((a:any)=>a.title).slice(0,10).join(" | ")}
Recent timeline: ${tles.map((t:any)=>`${t.title}(${t.type})`).slice(0,10).join(" | ")}
Phases envelope: ${phases.map((p:any)=>p.title).join(" | ") || "(draft phases)"}

Return strict JSON: { phases:[{title, tasks:[{title,module,owner?,startAt?,dueAt?,dependsOn?[]}]}] }
Dates in ISO if present.`;

  const r = await ai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    response_format: { type:"json_object" },
    messages: [{ role:"system", content: sys }, { role:"user", content: usr }]
  });

  let out:any={ phases:[] };
  try { out = JSON.parse(r.choices[0]?.message?.content || "{}"); } catch {}
  res.json({ ok:true, preview: out });
});

plan.post("/commit", requireProject("member"), async (req,res)=>{
  const { projectId, title, preview } = req.body||{};
  if (!projectId || !title || !preview?.phases) return res.status(400).json({ error:"projectId, title, preview.phases required" });

  await db.execute(sql`update project_plans set is_active=false where project_id=${projectId}`);
  const ins = await db.execute(
    sql`insert into project_plans (project_id, title, is_active) values (${projectId},${title},true) returning id`
  );
  const planId = (ins.rows?.[0]?.id as string) || null;

  let order = 0;
  for (const ph of (preview.phases||[])) {
    let phaseId:null|string = null;
    if (ph.title) {
      const r = await db.execute(sql`select id from roadmap_phases where project_id=${projectId} and lower(title)=lower(${ph.title}) limit 1`);
      phaseId = r.rows?.[0]?.id || null;
    }
    for (const t of (ph.tasks||[])) {
      await db.execute(
        sql`insert into plan_tasks (project_id, plan_id, phase_id, title, module, owner, start_at, due_at, status, priority, order_index, source)
         values (${projectId},${planId},${phaseId},${t.title},${t.module||detectModule(String(t.title||""))},${t.owner||null},${t.startAt||null},${t.dueAt||null},${'planned'},${50},${order++},${'assistant'})`
      );
    }
  }

  res.json({ ok:true, planId });
});

export default plan;
