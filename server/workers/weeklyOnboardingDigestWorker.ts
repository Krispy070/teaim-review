import { db } from "../db/client";
import { sql } from "drizzle-orm";
import fetch from "node-fetch";
import { beat } from "../lib/heartbeat";

function withinWindow(minUTC:number,maxUTC:number){
  const m = new Date().getUTCHours()*60 + new Date().getUTCMinutes();
  return m>=minUTC && m<=maxUTC;
}

async function emailEnabled(pid:string){
  const r = await db.execute(sql`select coalesce(onboarding_email_digest_enabled,true) as on from project_settings where project_id=${pid}`);
  return !!(r.rows?.[0] as any)?.on;
}

async function stakeholderEmails(pid:string){
  const s = await db.execute(sql`select distinct email from stakeholders where project_id=${pid} and email is not null`);
  return (s.rows||[]).map((r:any)=>r.email);
}

export function startWeeklyOnboardingDigestWorker(){
  setInterval(async ()=>{
    try {
      const now = new Date();
      const dow = now.getUTCDay();
      if (dow !== 1 || !withinWindow(15*60, 15*60+15)) return;

    const projs = (await db.execute(
      sql`select distinct project_id as id from onboarding_steps`
    )).rows || [];

    for (const p of projs){
      const pid = p.id as string;

      const steps = (await db.execute(
        sql`select s.id, s.title, s.status,
                coalesce(t.done,0)::int as done, coalesce(t.total,0)::int as total
           from onboarding_steps s
           left join (
             select step_id,
                    sum(case when status='done' then 1 else 0 end) as done,
                    count(*) as total
               from onboarding_tasks
              where project_id=${pid} group by step_id
           ) t on t.step_id = s.id
          where s.project_id=${pid}
          order by s.order_index asc`
      )).rows || [];

      const soon = (await db.execute(
        sql`select title from onboarding_tasks
          where project_id=${pid} and status<>'done'
            and due_at between now() and now() + interval '7 days'
          order by due_at asc limit 5`
      )).rows || [];

      const overdue = (await db.execute(
        sql`select title from onboarding_tasks
          where project_id=${pid} and status<>'done'
            and due_at < now()
          order by due_at desc limit 5`
      )).rows || [];

      const lines:string[] = [];
      lines.push(`Onboarding Weekly Digest`);
      lines.push(steps.map((s:any)=> `${s.title}: ${s.total? Math.round((s.done*100)/s.total):0}%`).join(" • ") || "(no steps)");
      if (soon.length)   lines.push(`Due soon (7d): ${soon.map((x:any)=>x.title).join(" | ")}`);
      if (overdue.length)lines.push(`Overdue: ${overdue.map((x:any)=>x.title).join(" | ")}`);

      const body = lines.join("\n");
      await fetch(`http://localhost:${process.env.PORT||5000}/api/messaging/post`, {
        method:"POST", headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ projectId: pid, category:"onboarding", text: body })
      }).catch(()=>{});

      if (await emailEnabled(pid)){
        const to = await stakeholderEmails(pid);
        if (to.length){
          const { sendEmail } = await import("../lib/notify");
          await sendEmail(to, "Onboarding Weekly Digest", body, [], "onboarding");
        }
      }
    }
      await beat("onboardingDigest", true);
    } catch (e) {
      console.error("[onboardingDigest]", e);
      await beat("onboardingDigest", false, String(e));
    }
  }, 15 * 60 * 1000);
}
