import { db } from "../db/client";
import { sql } from "drizzle-orm";
import parser from "cron-parser";
import { sendSlackWebhook, sendGenericWebhook } from "../lib/slack";

async function projectWebhooks(projectId:string, evt:string){
  const { rows } = await db.execute(sql.raw(`select type, url from webhooks where project_id=$1 and (events @> $2::jsonb)`), [projectId, JSON.stringify([evt])] as any);
  return rows||[];
}

export function startIntegrationSchedulerWorker(){
  setInterval(async ()=>{
    try{
      const { rows: ints } = await db.execute(sql.raw(
        `select id, project_id as "projectId", schedule_cron as "cron", timezone, next_run_at as "nextRunAt"
           from integrations where schedule_cron is not null and schedule_cron <> ''`
      ));
      const now = new Date();
      for (const it of (ints||[])){
        try {
          const opts:any = {}; if (it.timezone) opts.tz = it.timezone;
          const interval = parser.parseExpression(it.cron, opts);
          let next = it.nextRunAt ? new Date(it.nextRunAt) : null;
          if (!next || next <= now) {
            next = interval.next().toDate();
            await db.execute(sql.raw(`update integrations set next_run_at=$1 where id=$2`), [next.toISOString(), it.id] as any);
          }
          const in2 = new Date(now.getTime() + 2*60*1000);
          if (next > now && next <= in2) {
            const { rows: exists } = await db.execute(sql.raw(
              `select id from integration_runs where integration_id=$1 and planned_at=$2 limit 1`
            ), [it.id, next.toISOString()] as any);
            if (!exists?.length) {
              await db.execute(sql.raw(
                `insert into integration_runs (project_id, integration_id, planned_at, status) values ($1,$2,$3,'planned')`
              ), [it.projectId, it.id, next.toISOString()] as any);
            }
          }
        } catch (e) { 
          console.error(`[scheduler] integration ${it.id} cron error: ${(e as Error).message}`, { cron: it.cron, timezone: it.timezone });
        }
      }
    }catch(e){ console.error("[scheduler] error", e); }
  }, 120_000);

  setInterval(async ()=>{
    try{
      const now = new Date();
      const { rows } = await db.execute(sql.raw(
        `select r.id, r.project_id as "projectId", r.integration_id as "integrationId", r.planned_at as "plannedAt",
                i.sla_target as "sla", i.window_local as "window", i.name
           from integration_runs r
      inner join integrations i on i.id = r.integration_id
          where r.status = 'planned'`
      ));
      for (const r of (rows||[])) {
        const planned = new Date(r.plannedAt);
        let mins = 10;
        const m = String(r.sla||"").match(/(\d+)\s*m/i);
        if (m) mins = Number(m[1]||"10") || 10;
        if (now.getTime() - planned.getTime() > mins*60*1000) {
          await db.execute(sql.raw(`update integration_runs set status='missed', finished_at=now() where id=$1`), [r.id] as any);
          await db.execute(sql.raw(
            `insert into notifications (project_id, type, payload, is_read)
             values ($1,'integration_missed', $2, false)`
          ), [r.projectId, JSON.stringify({ integrationId:r.integrationId, name: r.name, plannedAt:r.plannedAt, sla: r.sla })] as any);
          for (const w of await projectWebhooks(r.projectId, "run_missed_sla")) {
            if (w.type==="slack") {
              await sendSlackWebhook(w.url, `:hourglass_flowing_sand: Missed SLA — ${r.name} (${r.integrationId}) ${r.sla||""}`);
            } else if (w.type==="generic") {
              await sendGenericWebhook(w.url, { 
                event: "run_missed_sla", 
                integration: { id: r.integrationId, name: r.name }, 
                projectId: r.projectId, 
                plannedAt: r.plannedAt,
                sla: r.sla,
                timestamp: new Date().toISOString()
              });
            }
          }
        }
      }
    } catch(e){ console.error("[scheduler][sla] error", e); }
  }, 300_000);
}
