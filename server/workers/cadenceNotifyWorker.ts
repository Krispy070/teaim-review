import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { sendEmail } from "../lib/notify";
import { sendSlackWebhook, sendGenericWebhook } from "../lib/slack";
import { handleWorkerError, workersDisabled } from "./utils";

async function projectWebhooks(projectId:string, evt:string){
  const eventsJson = JSON.stringify([evt]);
  const { rows } = await db.execute(
    sql`select type, url from webhooks where project_id=${projectId} and (events @> ${eventsJson}::jsonb)`
  );
  return rows||[];
}

async function subscribers(projectId: string, evt: string): Promise<Array<{ email: string; slack?: string; digest: string; sendEmail: boolean; sendSlack: boolean }>> {
  const eventsJson = JSON.stringify([evt]);
  const { rows } = await db.execute(
    sql`select 
          ua.user_email as email, 
          w.url as slack, 
          coalesce(ua.digest,'immediate') as digest,
          CASE
            WHEN ua.email_events IS NULL OR ua.email_events = '[]'::jsonb THEN
              (ua.email = true AND ua.events @> ${eventsJson}::jsonb)
            ELSE
              (ua.email_events @> ${eventsJson}::jsonb)
          END as "sendEmail",
          CASE
            WHEN ua.slack_events IS NULL OR ua.slack_events = '[]'::jsonb THEN
              (ua.slack_webhook_id IS NOT NULL AND ua.events @> ${eventsJson}::jsonb)
            ELSE
              (ua.slack_events @> ${eventsJson}::jsonb)
          END as "sendSlack"
       from user_alerts ua
       left join webhooks w on w.id = ua.slack_webhook_id
      where ua.project_id = ${projectId}
        and (ua.events @> ${eventsJson}::jsonb 
             OR coalesce(ua.email_events,'[]'::jsonb) @> ${eventsJson}::jsonb 
             OR coalesce(ua.slack_events,'[]'::jsonb) @> ${eventsJson}::jsonb)
        and (ua.mute_until is null or ua.mute_until < now())`
  );
  return (rows || []) as Array<{ email: string; slack?: string; digest: string; sendEmail: boolean; sendSlack: boolean }>;
}

export function startCadenceNotifyWorker(){
  setInterval(async ()=>{
    if (workersDisabled()) return;
    try{
      const now = new Date();
      const in15 = new Date(now.getTime() + 15*60*1000);
      const { rows: cads } = await db.execute(sql`select project_id as "projectId", id, name, frequency, dow as "dayOfWeek", time_utc as "timeUtc" from cadences`);

      for (const c of cads){
        const row = c as any;
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0,0,0));
        const delta = (7 + Number(row.dayOfWeek||3) - d.getUTCDay()) % 7;
        d.setUTCDate(d.getUTCDate() + delta);
        const [hh,mm] = String(row.timeUtc||"17:00").split(":").map(Number);
        d.setUTCHours(hh||17, mm||0, 0, 0);

        if (d >= now && d <= in15){
          const payload = JSON.stringify({ cadenceId:row.id, name:row.name, at:d.toISOString() });
          
          const { rows: existing } = await db.execute(
            sql`select id from notifications 
             where project_id=${row.projectId} 
             and type='cadence_upcoming' 
             and payload=${payload}
             and is_read=false
             limit 1`
          );
          
          if (!existing || existing.length === 0) {
            await db.execute(
              sql`insert into notifications (project_id, type, payload, is_read)
               values (${row.projectId},'cadence_upcoming', ${payload}, false)`
            );
            
            const subject = `[TEAIM] Cadence in 15 minutes: ${row.name}`;
            const text = `Cadence: ${row.name}\nWhen: ${d.toLocaleString()}`;
            
            const subs = await subscribers(row.projectId, "cadence_upcoming");
            const immediateEmails = subs.filter(s => s.digest === "immediate" && s.sendEmail).map(s => s.email);
            const immediateSlacks = subs.filter(s => s.digest === "immediate" && s.sendSlack && s.slack).map(s => s.slack!);
            
            if (immediateEmails.length) await sendEmail(immediateEmails, subject, text);
            for (const url of immediateSlacks) await sendSlackWebhook(url, `:calendar: ${subject}\n${text}`);
            
            if (!immediateEmails.length && !immediateSlacks.length) {
              const hooks = await projectWebhooks(row.projectId, "cadence_upcoming");
              for (const w of hooks) {
                const wh = w as any;
                if (wh.type==="slack") {
                  await sendSlackWebhook(wh.url, `:calendar: ${subject}\n${text}`);
                } else if (wh.type==="generic") {
                  await sendGenericWebhook(wh.url, { 
                    event: "cadence_upcoming", 
                    cadence: { id: row.id, name: row.name }, 
                    projectId: row.projectId, 
                    when: d.toISOString(),
                    timestamp: new Date().toISOString()
                  });
                }
              }
              if (!hooks.length) {
                const toRows = await db.execute(
                  sql`select email from stakeholders where project_id=${row.projectId} and email is not null`
                );
                const to = toRows.rows.map((x:any)=>x.email).filter(Boolean);
                const setRow = await db.execute(sql`select enable_cadence_emails as en from alert_settings where project_id=${row.projectId}`);
                if (to.length && ((setRow.rows?.[0] as any)?.en ?? true)) {
                  await sendEmail(to, subject, text);
                }
              }
            }
          }
        }
      }
    }catch(error){
      handleWorkerError("cadenceNotify", error);
    }
  }, 60*1000);
}
