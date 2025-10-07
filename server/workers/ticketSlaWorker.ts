import { db } from "../db/client";
import { sendEmail } from "../lib/notify";
import { sql } from "drizzle-orm";

export function startTicketSlaWorker() {
  setInterval(async () => {
    try {
      // Mark first response timestamp when first outbound message posted
      await db.execute(
        sql`update tickets t
            set first_response_at = now()
          from (
            select ticket_id, min(created_at) as ts from ticket_messages where direction='out' group by ticket_id
          ) x
          where t.id = x.ticket_id and t.first_response_at is null`
      );

      // Check overdue first response and resolution
      const open = (await db.execute(
        sql`select t.id, t.project_id as "projectId", t.priority, t.status,
                t.created_at as "createdAt", t.first_response_at as "firstResponseAt"
           from tickets t where status not in ('closed')`
      )).rows || [];

      for (const t of open) {
        const slaRow = await db.execute(
          sql`select first_response_mins as fr, resolution_mins as rm from ticket_sla_policies where project_id=${(t as any).projectId} and priority=${(t as any).priority || "med"} limit 1`
        );
        const fr = (slaRow.rows?.[0] as any)?.fr ?? 240;
        const rm = (slaRow.rows?.[0] as any)?.rm ?? 2880;

        const now = Date.now();
        const created = new Date((t as any).createdAt).getTime();
        const firstDue = created + fr * 60 * 1000;
        const resDue = created + rm * 60 * 1000;

        if (!(t as any).firstResponseAt && now > firstDue) {
          // escalate first response breach once
          const chk = await db.execute(
            sql`select 1 from alert_state where project_id=${(t as any).projectId} and key=${"tkt-fr-" + (t as any).id} limit 1`
          );
          if (!chk.rows?.length) {
            await db.execute(
              sql`insert into alert_state (project_id, key, last_sent_at) values (${(t as any).projectId}, ${"tkt-fr-" + (t as any).id}, now())`
            );
            await sendEmail(
              (process.env.ALERT_EMAILS || "").split(",").filter(Boolean),
              `[TEAIM] Ticket first response overdue`,
              `Ticket ${(t as any).id} (${(t as any).priority}) has no first response.\nOpen Tickets page to triage.`
            );
            await db.execute(
              sql`update tickets set escalated_at=now() where id=${(t as any).id} and escalated_at is null`
            );
          }
        }
        if (now > resDue) {
          const chk = await db.execute(
            sql`select 1 from alert_state where project_id=${(t as any).projectId} and key=${"tkt-res-" + (t as any).id} limit 1`
          );
          if (!chk.rows?.length) {
            await db.execute(
              sql`insert into alert_state (project_id, key, last_sent_at) values (${(t as any).projectId}, ${"tkt-res-" + (t as any).id}, now())`
            );
            await sendEmail(
              (process.env.ALERT_EMAILS || "").split(",").filter(Boolean),
              `[TEAIM] Ticket resolution overdue`,
              `Ticket ${(t as any).id} (${(t as any).priority}) still open past SLA.\nOpen Tickets to escalate.`
            );
            await db.execute(
              sql`update tickets set escalated_at=now() where id=${(t as any).id} and escalated_at is null`
            );
          }
        }
      }
    } catch (e) {
      console.error("[ticketSLA]", e);
    }
  }, 60_000); // Run every minute
}
