import { Router } from "express";
import fetch from "node-fetch";
import { db } from "../db/client";
import { requireProject } from "../auth/projectAccess";
import { sql } from "drizzle-orm";

export const odpost = Router();

/* POST /api/onboarding/digest/post { projectId } */
odpost.post("/post", requireProject("member"), async (req,res)=>{
  const { projectId } = req.body||{};
  if (!projectId) return res.status(400).json({ error:"projectId" });

  const steps = (await db.execute(
    sql`select s.id, s.title,
            coalesce(t.done,0)::int as done, coalesce(t.total,0)::int as total
       from onboarding_steps s
       left join (
         select step_id, sum(case when status='done' then 1 else 0 end) as done, count(*) as total
           from onboarding_tasks where project_id=${projectId} group by step_id
       ) t on t.step_id = s.id
      where s.project_id=${projectId} order by s.order_index asc`
  )).rows || [];

  const soon = (await db.execute(
    sql`select title from onboarding_tasks where project_id=${projectId} and status<>'done'
       and due_at between now() and now() + interval '7 days' order by due_at asc limit 5`
  )).rows || [];
  const overdue = (await db.execute(
    sql`select title from onboarding_tasks where project_id=${projectId} and status<>'done'
       and due_at < now() order by due_at desc limit 5`
  )).rows || [];

  const lines:string[] = [];
  lines.push(`Onboarding Weekly Digest`);
  lines.push(steps.map((s:any)=> `${s.title}: ${s.total? Math.round((s.done*100)/s.total):0}%`).join(" • ") || "(no steps)");
  if (soon.length)   lines.push(`Due soon (7d): ${soon.map((x:any)=>x.title).join(" | ")}`);
  if (overdue.length)lines.push(`Overdue: ${overdue.map((x:any)=>x.title).join(" | ")}`);

  await fetch(`http://localhost:${process.env.PORT||5000}/api/messaging/post`, {
    method:"POST", headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ projectId, category:"onboarding", text: lines.join("\n") })
  }).catch(()=>{});

  res.json({ ok:true, posted:true });
});

export default odpost;
