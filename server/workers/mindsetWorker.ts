import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { sendEmail } from "../lib/notify";
import { sendSlackWebhook } from "../lib/slack";

export function startMindsetWorker(){
  // every hour, send in the 8–9am local time window (UTC 15–16 for example) — light heuristic
  setInterval(async ()=>{
    const now = new Date();
    const h = now.getUTCHours();
    if (!(h===15 || h===16)) return; // adjust to your preferred window

    // active projects
    const { rows: projs } = await db.execute(sql`select distinct project_id as id from onboarding_steps where status<>'done'`);
    for (const p of projs||[]){
      const pid = p.id as string;

      // simple nudge content
      const text = `Weekly Mindset Check-in:
• What went right this week?
• What's blocking us?
• What action can we take to own the outcome?

Reply to this email or post in your project channel; I'll capture highlights and create actions/risks as needed.`;

      // email broadcast (stakeholders with email)
      const s = await db.execute(sql`select distinct email from stakeholders where project_id=${pid} and email is not null`);
      const emails = (s.rows||[]).map((r:any)=>r.email);
      if (emails.length) await sendEmail(emails, "[TEAIM] Weekly Mindset Check-in", text);

      // slack hook(s) (reuse "daily_brief" event channel or create dedicated "mindset")
      const hooks = (await db.execute(
        sql`select url from webhooks where project_id=${pid} and (events @> ${JSON.stringify(["daily_brief"])}::jsonb)`
      )).rows || [];
      for (const h of hooks) await sendSlackWebhook(h.url, `:thought_balloon: ${text}`);
    }
  }, 60*60*1000);
}
