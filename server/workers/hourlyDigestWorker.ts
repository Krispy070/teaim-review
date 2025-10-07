import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { sendEmail } from "../lib/notify";
import { sendSlackWebhook } from "../lib/slack";

async function processHourlyDigests() {
  try {
    const { rows } = await db.execute(
      sql`select project_id as "projectId", user_email as "userEmail", email, slack_webhook_id as "slackWebhookId"
         from user_alerts
        where digest='hourly'
          and (mute_until is null or mute_until < now())`
    );
    
    for (const r of rows) {
      const row = r as any;
      const digest = await db.execute(
        sql`select count(*)::int as pending
           from digest_queue
          where project_id=${row.projectId} and user_email=${row.userEmail} and sent_at is null`
      );
      const count = (digest.rows?.[0] as any)?.pending || 0;
      
      if (count === 0) continue;
      
      const items = (await db.execute(
        sql`select event_type as "eventType", summary, created_at as "createdAt"
           from digest_queue
          where project_id=${row.projectId} and user_email=${row.userEmail} and sent_at is null
          order by created_at desc limit 50`
      )).rows || [];
      
      const body = `Hourly Digest (${count} events)\n\n` + items.map((i: any) => 
        `[${i.eventType}] ${i.summary} (${new Date(i.createdAt).toLocaleTimeString()})`
      ).join('\n');
      
      if (row.email) {
        await sendEmail([row.userEmail], `[TEAIM] Hourly Digest - ${count} events`, body);
      }
      
      if (row.slackWebhookId) {
        const wh = (await db.execute(sql`select url from webhooks where id=${row.slackWebhookId}`)).rows?.[0];
        if (wh) await sendSlackWebhook((wh as any).url, body);
      }
      
      await db.execute(
        sql`update digest_queue set sent_at=now() where project_id=${row.projectId} and user_email=${row.userEmail} and sent_at is null`
      );
    }
  } catch (err) {
    console.error("[hourlyDigestWorker] error:", err);
  }
}

function scheduleNextHourlyRun() {
  const now = new Date();
  const nextHour = new Date(now);
  nextHour.setHours(now.getHours() + 1, 0, 0, 0);
  const msUntilNextHour = nextHour.getTime() - now.getTime();
  
  setTimeout(() => {
    processHourlyDigests();
    setInterval(processHourlyDigests, 60 * 60 * 1000);
  }, msUntilNextHour);
}

export function startHourlyDigestWorker() {
  scheduleNextHourlyRun();
}
