import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { sendEmail, sendSMS } from "../lib/notify";
import { sendSlackWebhook, sendGenericWebhook } from "../lib/slack";

async function projectMutedUntil(projectId: string) {
  const { rows } = await db.execute(
    sql`select alerts_muted_until as "until" from project_settings where project_id=${projectId}`
  );
  return rows?.[0]?.until ? new Date((rows[0] as any).until).getTime() : 0;
}

async function projectWebhooks(projectId:string|null, evt:string): Promise<Array<{ type: string; url: string }>>{
  const eventsJson = JSON.stringify([evt]);
  const { rows } = await db.execute(
    sql`select type, url from webhooks where project_id = ${projectId} and (events @> ${eventsJson}::jsonb)`
  );
  return (rows||[]) as Array<{ type: string; url: string }>;
}

async function subscribers(projectId: string | null, evt: string): Promise<Array<{ email: string; slack?: string; digest: string }>> {
  const eventsJson = JSON.stringify([evt]);
  const { rows } = await db.execute(
    sql`select ua.user_email as email, w.url as slack, coalesce(ua.digest,'immediate') as digest
       from user_alerts ua
       left join webhooks w on w.id = ua.slack_webhook_id
      where ua.project_id = ${projectId}
        and ua.events @> ${eventsJson}::jsonb
        and (ua.mute_until is null or ua.mute_until < now())
        and ua.email = true`
  );
  return (rows || []) as Array<{ email: string; slack?: string; digest: string }>;
}

async function emailsFor(projectId:string, fallbackEnv=true): Promise<string[]> {
  const r = await db.execute(
    sql`select recipients from alert_settings where project_id=${projectId}`
  );
  const list = (r.rows?.[0] as any)?.recipients || [];
  if (Array.isArray(list) && list.length) return list;
  if (fallbackEnv && process.env.ALERT_EMAILS) return process.env.ALERT_EMAILS.split(",").map(s=>s.trim()).filter(Boolean);
  return [];
}

async function shouldSend(projectId:string|null, key:string, cooldownMin=15){
  const { rows } = await db.execute(
    sql`select id, last_sent_at as "lastSentAt" from alert_state where project_id is not distinct from ${projectId} and key=${key} limit 1`
  );
  const now = Date.now();
  const row = rows?.[0] as any;
  const last = row?.lastSentAt ? new Date(row.lastSentAt).getTime() : 0;
  if (now - last < cooldownMin*60*1000) return false;
  if (rows?.length) {
    await db.execute(sql`update alert_state set last_sent_at=now() where id=${row.id}`);
  } else {
    await db.execute(sql`insert into alert_state (project_id, key, last_sent_at) values (${projectId}, ${key}, now())`);
  }
  return true;
}

export function startAlertWorkers(){
  setInterval(async ()=>{
    try {
      const errRows = (await db.execute(
        sql`select project_id as "projectId", count(*)::int as n
           from error_log
          where created_at >= now() - interval '5 minutes'
          group by project_id`
      )).rows || [];

      for (const r of errRows) {
        const row = r as any;
        const pid = row.projectId || null;
        const muted = pid ? await projectMutedUntil(pid) : 0;
        if (muted && muted > Date.now()) continue; // project snoozed → skip sending
        const tRow = await db.execute(sql`select errors_5m_threshold as n from alert_settings where project_id is not distinct from ${pid}`);
        const thresh = (tRow.rows?.[0] as any)?.n || Number(process.env.ALERT_ERRORS_5M || "5");
        if (row.n >= thresh && await shouldSend(pid, "errors-5m")) {
          const subs = await subscribers(pid||"", "errors");
          const immediateEmails = subs.filter(s => s.digest === "immediate").map(s => s.email);
          const immediateSlacks = subs.filter(s => s.digest === "immediate" && s.slack).map(s => s.slack!);
          
          if (immediateEmails.length) {
            await sendEmail(immediateEmails, 
              `[TEAIM] Error spike (${row.n} in 5m)`,
              `Project: ${pid||"(global)"}\nErrors in last 5 minutes: ${row.n}\nVisit Ops/Logs for details.`
            );
          }
          for (const url of immediateSlacks) {
            await sendSlackWebhook(url, `:rotating_light: Error spike (${row.n}/5m) ${pid||"(global)"}`);
          }
          
          if (!immediateEmails.length && !immediateSlacks.length) {
            const hooks = await projectWebhooks(pid, "errors");
            for (const w of hooks) {
              if (w.type==="slack") {
                await sendSlackWebhook(w.url, `:rotating_light: Error spike (${row.n}/5m) ${pid||"(global)"}`);
              } else if (w.type==="generic") {
                await sendGenericWebhook(w.url, { 
                  event: "errors", 
                  projectId: pid||"(global)", 
                  count: row.n, 
                  window: "5m",
                  timestamp: new Date().toISOString()
                });
              }
            }
            if (!hooks.length) {
              const fallback = await emailsFor(pid||"", true);
              if (fallback.length) {
                await sendEmail(fallback,
                  `[TEAIM] Error spike (${row.n} in 5m)`,
                  `Project: ${pid||"(global)"}\nErrors in last 5 minutes: ${row.n}\nVisit Ops/Logs for details.`
                );
              }
            }
          }
        }
      }

      const mins = Number(process.env.ALERT_QUEUE_STUCK_MINS || "15");
      const stale = (await db.execute(
        sql`select 'embed' as type, project_id as "projectId", count(*)::int as n
           from embed_jobs where status='running' and updated_at < now() - interval '${sql.raw(mins.toString())} minutes' group by project_id
         union all
         select 'parse' as type, project_id, count(*)::int
           from parse_jobs where status='running' and updated_at < now() - interval '${sql.raw(mins.toString())} minutes' group by project_id`
      )).rows || [];
      for (const s of stale) {
        const staleRow = s as any;
        const pid = staleRow.projectId || null;
        const muted = pid ? await projectMutedUntil(pid) : 0;
        if (muted && muted > Date.now()) continue; // project snoozed → skip sending
        if (await shouldSend(pid, `queue-stuck-${staleRow.type}`)) {
          const subs = await subscribers(pid||"", "queue");
          const immediateEmails = subs.filter(s => s.digest === "immediate").map(s => s.email);
          const immediateSlacks = subs.filter(s => s.digest === "immediate" && s.slack).map(s => s.slack!);
          
          if (immediateEmails.length) {
            await sendEmail(immediateEmails,
              `[TEAIM] ${staleRow.type} queue stuck`,
              `Project: ${pid||"(global)"}\n${staleRow.n} ${staleRow.type} jobs appear stuck > ${mins}m.\nSee Ops/Health to retry.`
            );
          }
          for (const url of immediateSlacks) {
            await sendSlackWebhook(url, `:warning: ${staleRow.type} queue stuck (${staleRow.n} jobs) ${pid||"(global)"}`);
          }
          
          if (!immediateEmails.length && !immediateSlacks.length) {
            const hooks = await projectWebhooks(pid, "queue");
            for (const w of hooks) {
              if (w.type==="slack") {
                await sendSlackWebhook(w.url, `:warning: ${staleRow.type} queue stuck (${staleRow.n} jobs) ${pid||"(global)"}`);
              } else if (w.type==="generic") {
                await sendGenericWebhook(w.url, { 
                  event: "queue", 
                  projectId: pid||"(global)", 
                  queueType: staleRow.type, 
                  stuckJobs: staleRow.n,
                  timestamp: new Date().toISOString()
                });
              }
            }
            if (!hooks.length) {
              const fallback = await emailsFor(pid||"", true);
              if (fallback.length) {
                await sendEmail(fallback,
                  `[TEAIM] ${staleRow.type} queue stuck`,
                  `Project: ${pid||"(global)"}\n${staleRow.n} ${staleRow.type} jobs appear stuck > ${mins}m.\nSee Ops/Health to retry.`
                );
              }
            }
          }
        }
      }
    } catch (err) {
      console.error("[alertWorkers] error:", err);
    }
  }, 60_000);
}
