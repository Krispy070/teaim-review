import { db } from "../db/client";
import { sql } from "drizzle-orm";
import fetch from "node-fetch";
import { beat } from "../lib/heartbeat";
import { handleWorkerError, workersDisabled } from "./utils";

async function post(projectId: string, text: string, category = "plan") {
  const url = `http://localhost:${process.env.PORT || 5000}/api/messaging/post`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, category, text }),
  }).catch(() => {});
}

function withinWindow(minUTCMin: number, maxUTCMin: number) {
  const now = new Date();
  const m = now.getUTCHours() * 60 + now.getUTCMinutes();
  return m >= minUTCMin && m <= maxUTCMin;
}

export function startOffboardingWeeklyWorker() {
  setInterval(async () => {
    if (workersDisabled()) return;
    try {
      const now = new Date();
      const dow = now.getUTCDay();
      if (dow !== 1 || !withinWindow(15 * 60, 15 * 60 + 15)) return;

      const projs = await db.execute(
        sql`select distinct c.project_id as id
              from cohorts c
         left join offboarding_rows o on o.cohort_id = c.id
             where o.id is not null`
      );

      const projRows = (projs as any).rows || [];

      for (const p of projRows) {
        const pid = p.id as string;

        const cohorts = await db.execute(
          sql`select id, name, type
                from cohorts
               where project_id=${pid}
            order by created_at desc
               limit 50`
        );

        const cohortRows = (cohorts as any).rows || [];

        for (const c of cohortRows) {
          const sum = await db.execute(
            sql`select status, count(*)::int as n
                  from offboarding_rows
                 where cohort_id=${c.id}
              group by status`
          );

          const sumRows = (sum as any).rows || [];

          if (!sumRows.length) continue;

          const of = (label: string) =>
            sumRows.find((x: any) => (x.status || "") === label)?.n || 0;

          const soonResult = await db.execute(
            sql`select count(*)::int as n
                  from offboarding_rows
                 where cohort_id=${c.id} and status<>'done'
                   and coalesce(terminate_date, last_day) is not null
                   and coalesce(terminate_date, last_day) between now() and now() + interval '7 days'`
          );
          const soon = (soonResult as any).rows?.[0]?.n || 0;

          const overResult = await db.execute(
            sql`select count(*)::int as n
                  from offboarding_rows
                 where cohort_id=${c.id} and status<>'done'
                   and coalesce(terminate_date, last_day) is not null
                   and coalesce(terminate_date, last_day) < now()`
          );
          const over = (overResult as any).rows?.[0]?.n || 0;

          const body = [
            `Offboarding Weekly Summary — ${c.name} (${c.type})`,
            `planned: ${of("planned")} • in_progress: ${of("in_progress")} • blocked: ${of("blocked")} • done: ${of("done")}`,
            `due soon (7d): ${soon} • overdue: ${over}`
          ].join("\n");

          await post(pid, body, "plan");
        }
      }
      await beat("offboardingWeekly", true);
    } catch (e) {
      await beat("offboardingWeekly", false, String(e));
      handleWorkerError("offboardingWeekly", e);
    }
  }, 15 * 60 * 1000);
}
