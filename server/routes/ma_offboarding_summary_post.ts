import { Router } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import fetch from "node-fetch";
import { requireProject } from "../auth/projectAccess";

export const offpost = Router();

offpost.post("/cohorts/:id/offboarding/post-weekly", requireProject("member"), async (req, res) => {
  const cid = String(req.params.id || "");
  const { projectId, category = "plan" } = req.body || {};
  if (!projectId || !cid) return res.status(400).json({ error: "projectId & cohortId" });

  const cohResult = await db.execute(sql`select name, type from cohorts where id=${cid}`);
  const coh = (cohResult as any).rows?.[0];

  const sumResult = await db.execute(
    sql`select status, count(*)::int as n
          from offboarding_rows
         where cohort_id=${cid}
      group by status`
  );
  const sum = (sumResult as any).rows || [];

  const of = (label: string) =>
    sum.find((x: any) => (x.status || "") === label)?.n || 0;

  const soonResult = await db.execute(
    sql`select count(*)::int as n
          from offboarding_rows
         where cohort_id=${cid} and status<>'done'
           and coalesce(terminate_date, last_day) is not null
           and coalesce(terminate_date, last_day) between now() and now() + interval '7 days'`
  );
  const soon = (soonResult as any).rows?.[0]?.n || 0;

  const overResult = await db.execute(
    sql`select count(*)::int as n
          from offboarding_rows
         where cohort_id=${cid} and status<>'done'
           and coalesce(terminate_date, last_day) is not null
           and coalesce(terminate_date, last_day) < now()`
  );
  const over = (overResult as any).rows?.[0]?.n || 0;

  const text = [
    `Offboarding Weekly Summary — ${coh?.name || cid} (${coh?.type || "cohort"})`,
    `planned: ${of("planned")} • in_progress: ${of("in_progress")} • blocked: ${of("blocked")} • done: ${of("done")}`,
    `due soon (7d): ${soon} • overdue: ${over}`
  ].join("\n");

  const url = `http://localhost:${process.env.PORT || 5000}/api/messaging/post`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, category, text }),
  }).catch(() => {});
  res.json({ ok: true, posted: true });
});

export default offpost;
