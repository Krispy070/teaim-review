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

/**
 * Runs every minute; for each project, finds training sessions starting
 * in ~24h and ~1h windows, inserts notifications once, and flips flags.
 */
export function startTrainingReminderWorker(){
  const tick = async ()=>{
    if (workersDisabled()) return;
    const now = new Date();
    const iso = (d:Date)=> d.toISOString();

    // 24h window: now+24h ± 2 minutes
    const w24s = iso(new Date(now.getTime() + 24*60*60*1000 - 2*60*1000));
    const w24e = iso(new Date(now.getTime() + 24*60*60*1000 + 2*60*1000));

    // 1h window: now+1h ± 2 minutes
    const w1s = iso(new Date(now.getTime() + 60*60*1000 - 2*60*1000));
    const w1e = iso(new Date(now.getTime() + 60*60*1000 + 2*60*1000));

    // 24h
    const { rows: soon24 } = await db.execute(
      sql`select id, project_id as "projectId", topic, module, start_at as "startAt", location_url as "locationUrl"
         from training_plan
        where start_at is not null
          and reminded_24 = false
          and start_at between ${w24s} and ${w24e}`
    );

    for (const r of soon24){
      const row = r as any;
      const payload = JSON.stringify({ when:"24h", id:row.id, topic:row.topic, module:row.module, startAt:row.startAt, url:row.locationUrl });
      await db.execute(
        sql`insert into notifications (project_id, type, payload, is_read)
         values (${row.projectId},'training_upcoming', ${payload}, false)`
      );
      await db.execute(sql`update training_plan set reminded_24=true where id=${row.id}`);
      
      const when = "in 24 hours";
      const subject = `[TEAIM] Training ${when}: ${row.topic}`;
      const text = `Module: ${row.module||"-"}\nWhen: ${new Date(row.startAt).toLocaleString()}\nLink: ${row.locationUrl||"-"}`;
      
      const subs = await subscribers(row.projectId, "training_upcoming");
      const immediateEmails = subs.filter(s => s.digest === "immediate" && s.sendEmail).map(s => s.email);
      const immediateSlacks = subs.filter(s => s.digest === "immediate" && s.sendSlack && s.slack).map(s => s.slack!);
      
      if (immediateEmails.length) await sendEmail(immediateEmails, subject, text);
      for (const url of immediateSlacks) await sendSlackWebhook(url, `:calendar: ${subject}\n${text}`);
      
      if (!immediateEmails.length && !immediateSlacks.length) {
        const hooks = await projectWebhooks(row.projectId, "training_upcoming");
        for (const w of hooks) {
          const wh = w as any;
          if (wh.type==="slack") {
            await sendSlackWebhook(wh.url, `:calendar: ${subject}\n${text}`);
          } else if (wh.type==="generic") {
            await sendGenericWebhook(wh.url, { 
              event: "training_upcoming", 
              training: { id: row.id, topic: row.topic, module: row.module }, 
              projectId: row.projectId, 
              when: "24h",
              timestamp: new Date().toISOString()
            });
          }
        }
        if (!hooks.length) {
          const toRows = await db.execute(
            sql`select email from stakeholders where project_id=${row.projectId} and email is not null`
          );
          const to = toRows.rows.map((x:any)=>x.email).filter(Boolean);
          const setRow = await db.execute(sql`select enable_training_emails as en from alert_settings where project_id=${row.projectId}`);
          if (to.length && ((setRow.rows?.[0] as any)?.en ?? true)) {
            await sendEmail(to, subject, text);
          }
        }
      }
    }

    // 1h
    const { rows: soon1 } = await db.execute(
      sql`select id, project_id as "projectId", topic, module, start_at as "startAt", location_url as "locationUrl"
         from training_plan
        where start_at is not null
          and reminded_1 = false
          and start_at between ${w1s} and ${w1e}`
    );

    for (const r of soon1){
      const row = r as any;
      const payload = JSON.stringify({ when:"1h", id:row.id, topic:row.topic, module:row.module, startAt:row.startAt, url:row.locationUrl });
      await db.execute(
        sql`insert into notifications (project_id, type, payload, is_read)
         values (${row.projectId},'training_upcoming', ${payload}, false)`
      );
      await db.execute(sql`update training_plan set reminded_1=true where id=${row.id}`);
      
      const when = "in 1 hour";
      const subject = `[TEAIM] Training ${when}: ${row.topic}`;
      const text = `Module: ${row.module||"-"}\nWhen: ${new Date(row.startAt).toLocaleString()}\nLink: ${row.locationUrl||"-"}`;
      
      const subs = await subscribers(row.projectId, "training_upcoming");
      const immediateEmails = subs.filter(s => s.digest === "immediate" && s.sendEmail).map(s => s.email);
      const immediateSlacks = subs.filter(s => s.digest === "immediate" && s.sendSlack && s.slack).map(s => s.slack!);
      
      if (immediateEmails.length) await sendEmail(immediateEmails, subject, text);
      for (const url of immediateSlacks) await sendSlackWebhook(url, `:calendar: ${subject}\n${text}`);
      
      if (!immediateEmails.length && !immediateSlacks.length) {
        const hooks = await projectWebhooks(row.projectId, "training_upcoming");
        for (const w of hooks) {
          const wh = w as any;
          if (wh.type==="slack") {
            await sendSlackWebhook(wh.url, `:calendar: ${subject}\n${text}`);
          } else if (wh.type==="generic") {
            await sendGenericWebhook(wh.url, { 
              event: "training_upcoming", 
              training: { id: row.id, topic: row.topic, module: row.module }, 
              projectId: row.projectId, 
              when: "1h",
              timestamp: new Date().toISOString()
            });
          }
        }
        if (!hooks.length) {
          const toRows = await db.execute(
            sql`select email from stakeholders where project_id=${row.projectId} and email is not null`
          );
          const to = toRows.rows.map((x:any)=>x.email).filter(Boolean);
          const setRow = await db.execute(sql`select enable_training_emails as en from alert_settings where project_id=${row.projectId}`);
          if (to.length && ((setRow.rows?.[0] as any)?.en ?? true)) {
            await sendEmail(to, subject, text);
          }
        }
      }
    }
  };

  // Run every minute
  setInterval(async () => {
    if (workersDisabled()) return;
    try {
      await tick();
    } catch (error) {
      if (handleWorkerError("trainingReminder", error)) {
        return;
      }
      console.error("[trainingReminder] error", error);
    }
  }, 60*1000);
}
