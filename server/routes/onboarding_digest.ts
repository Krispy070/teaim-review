import { Router } from "express";
import { db } from "../db/client";
import { requireProject } from "../auth/projectAccess";
import { sql } from "drizzle-orm";

export const od = Router();

/* GET /api/onboarding/digest?projectId=&lookbackDays=7 */
od.get("/", requireProject("member"), async (req,res)=>{
  const pid = String(req.query.projectId||"");
  const lookback = Math.min(30, Math.max(1, Number(req.query.lookbackDays||"7")));

  const steps = (await db.execute(
    sql`select s.id, s.key, s.title, s.status,
            coalesce(t.done,0)::int as done, coalesce(t.total,0)::int as total
       from onboarding_steps s
       left join (
         select step_id,
                sum(case when status='done' then 1 else 0 end) as done,
                count(*) as total
           from onboarding_tasks
          where project_id=${pid}
          group by step_id) t on t.step_id = s.id
      where s.project_id=${pid}
      order by s.order_index asc`
  )).rows||[];

  const soon = (await db.execute(
    sql`select title, owner, due_at as "dueAt" from onboarding_tasks
      where project_id=${pid} and status<>'done' and due_at between now() and now() + interval '7 days'
      order by due_at asc limit 10`
  )).rows||[];

  const overdue = (await db.execute(
    sql`select title, owner, due_at as "dueAt" from onboarding_tasks
      where project_id=${pid} and status<>'done' and due_at < now()
      order by due_at desc limit 10`
  )).rows||[];

  const reflections = (await db.execute(
    sql`select content, created_at as "createdAt" from onboarding_reflections
      where project_id=${pid} and created_at >= now() - (${String(lookback)} || ' days')::interval
      order by created_at desc limit 3`
  )).rows||[];

  const metrics = (await db.execute(
    sql`select name, owner, target, current, status from onboarding_metrics
      where project_id=${pid} order by created_at desc limit 8`
  )).rows||[];

  res.json({ ok:true, steps, soon, overdue, reflections, metrics });
});

export default od;
