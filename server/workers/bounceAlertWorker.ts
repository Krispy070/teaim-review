import { db } from "../db/client";
import fetch from "node-fetch";
import { beat } from "../lib/heartbeat";
import { handleWorkerError, workersDisabled } from "./utils";

const THRESH = Number(process.env.EMAIL_BOUNCE_ALERT_THRESHOLD || "0.02");

async function post(projectId:string, text:string){
  await fetch(`http://localhost:${process.env.PORT||5000}/api/messaging/post`, {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ projectId, category:"alerts", text })
  }).catch(()=>{});
}

export function startBounceAlertWorker(){
  setInterval(async ()=>{
    if (workersDisabled()) return;
    try{
      const projs = (await db.execute(
        `select coalesce(project_id,'(global)') as pid
           from email_events
          where created_at >= now() - interval '24 hours'
       group by pid`, [] as any
      )).rows || [];

      for (const p of projs){
        const pid = p.pid as string;
        if (pid==="'(global)'" || pid==="(global)") continue;

        const r = (await db.execute(
          `select
              sum(case when status='sent'       then 1 else 0 end)::int as attempted,
              sum(case when status='bounced'    then 1 else 0 end)::int as bounced,
              sum(case when status='complained' then 1 else 0 end)::int as complained
             from email_events
            where project_id=$1 and created_at >= now() - interval '24 hours'`, [pid] as any
        )).rows?.[0] || { attempted:0, bounced:0, complained:0 };

        const attempted = r.attempted||0;
        if (!attempted) continue;
        const rate = ((r.bounced||0) + (r.complained||0)) / attempted;
        if (rate >= THRESH){
          const text = `:warning: Deliverability alert — 24h bounce rate ${(rate*100).toFixed(1)}% (threshold ${(THRESH*100).toFixed(1)}%). Investigate sender, lists, and suppressions.`;
          await post(pid, text);
          await db.execute(
            `insert into notifications (project_id, type, payload, is_read) values ($1,'deliverability_alert',$2,false)`,
            [pid, { rate, attempted, threshold: THRESH }] as any
          );
        }
      }
      await beat("bounceAlert", true);
    } catch(error){
      await beat("bounceAlert", false, String(error));
      handleWorkerError("bounceAlertWorker", error);
    }
  }, 24*60*60*1000);
}
