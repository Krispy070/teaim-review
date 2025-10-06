import { db } from "../db/client";
import { sendEmail } from "../lib/notify";
import { sendSlackWebhook } from "../lib/slack";
import { sql } from "drizzle-orm";
import { beat } from "../lib/heartbeat";

async function projectMutedUntil(projectId: string) {
  const r = await db.execute(
    sql`select alerts_muted_until as "u" from project_settings where project_id=${projectId}`
  );
  return r.rows?.[0]?.u ? new Date(r.rows[0].u).getTime() : 0;
}

async function projectWebhooksByEvent(projectId: string, event: string) {
  const { rows } = await db.execute(
    sql`select url from webhooks where project_id=${projectId} and (events @> ${JSON.stringify([event])}::jsonb)`
  );
  return (rows || []).map((r: any) => r.url);
}

async function ownerEmailList(projectId: string, owner: string | null) {
  const list: string[] = [];
  if (owner && /\S+@\S+\.\S+/.test(owner)) {
    list.push(owner);
  } else if (owner) {
    const { rows } = await db.execute(
      sql`select email from stakeholders where project_id=${projectId} and lower(name)=lower(${owner}) and email is not null`
    );
    rows?.forEach((r: any) => list.push(r.email));
  }
  if (!list.length && process.env.ALERT_EMAILS) {
    list.push(...process.env.ALERT_EMAILS.split(",").map(s => s.trim()).filter(Boolean));
  }
  return Array.from(new Set(list));
}

export function startPlanReminderWorker() {
  setInterval(async () => {
    try {
      const now = Date.now();

      const dueSoon = (await db.execute(
        sql`select t.id, t.project_id as "projectId", t.title, t.owner, t.due_at as "dueAt"
          from plan_tasks t
         where t.status in ('planned', 'in_progress', 'blocked')
           and t.due_at is not null
           and (t.snooze_until is null or t.snooze_until <= now())
           and t.remind_24_sent = false
           and t.due_at between now() and now() + interval '24 hours'`
      )).rows || [];

      for (const t of dueSoon) {
        const muted = await projectMutedUntil(t.projectId);
        if (muted && muted > now) continue;

        const to = await ownerEmailList(t.projectId, t.owner);
        const subject = `[TEAIM] Plan task due soon: ${t.title}`;
        const body = `Task "${t.title}" is due ${new Date(t.dueAt).toLocaleString()}.`;

        if (to.length) await sendEmail(to, subject, body);

        const hooks = await projectWebhooksByEvent(t.projectId, "run_success");
        for (const url of hooks) {
          await sendSlackWebhook(url, `:alarm_clock: Plan task due soon: ${t.title} (${new Date(t.dueAt).toLocaleString()})`);
        }

        await db.execute(sql`update plan_tasks set remind_24_sent=true where id=${t.id}`);

        const orgId = (await db.execute(
          sql`select org_id from projects where id=${t.projectId}`
        )).rows?.[0]?.org_id;

        if (orgId) {
          await db.execute(
            sql`insert into notifications (org_id, project_id, type, payload, is_read) values (${orgId}, ${t.projectId}, 'plan_due_soon', ${JSON.stringify({ taskId: t.id })}, false)`
          );
        }
      }

      const overdue = (await db.execute(
        sql`select t.id, t.project_id as "projectId", t.title, t.owner, t.due_at as "dueAt"
          from plan_tasks t
         where t.status in ('planned', 'in_progress', 'blocked')
           and t.due_at is not null
           and (t.snooze_until is null or t.snooze_until <= now())
           and t.overdue_sent = false
           and t.due_at < now()`
      )).rows || [];

      for (const t of overdue) {
        const muted = await projectMutedUntil(t.projectId);
        if (muted && muted > now) continue;

        const to = await ownerEmailList(t.projectId, t.owner);
        const subject = `[TEAIM] Plan task OVERDUE: ${t.title}`;
        const body = `Task "${t.title}" was due ${new Date(t.dueAt).toLocaleString()}.`;

        if (to.length) await sendEmail(to, subject, body);

        const hooks = await projectWebhooksByEvent(t.projectId, "errors");
        for (const url of hooks) {
          await sendSlackWebhook(url, `:warning: Plan task OVERDUE: ${t.title} (was ${new Date(t.dueAt).toLocaleString()})`);
        }

        await db.execute(sql`update plan_tasks set overdue_sent=true where id=${t.id}`);

        const orgId = (await db.execute(
          sql`select org_id from projects where id=${t.projectId}`
        )).rows?.[0]?.org_id;

        if (orgId) {
          await db.execute(
            sql`insert into notifications (org_id, project_id, type, payload, is_read) values (${orgId}, ${t.projectId}, 'plan_overdue', ${JSON.stringify({ taskId: t.id })}, false)`
          );
        }
      }
      await beat("planReminder", true);
    } catch (e) {
      console.error("[planReminder]", e);
      await beat("planReminder", false, String(e));
    }
  }, 10 * 60 * 1000);
}
