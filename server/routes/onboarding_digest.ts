import { Router } from "express";
import { pool } from "../db/client";
import { requireProject } from "../auth/projectAccess";

export const od = Router();

/* GET /api/onboarding/digest?projectId=&lookbackDays=7 */
od.get("/", requireProject("member"), async (req,res)=>{
  const pid = String(req.query.projectId||"");
  const lookback = Math.min(30, Math.max(1, Number(req.query.lookbackDays||"7")));

  try {
    const stepsResult = await pool.query(
      `select s.id, s.key, s.title, s.status,
              coalesce(t.done,0)::int as done, coalesce(t.total,0)::int as total
         from onboarding_steps s
         left join (
           select step_id,
                  sum(case when status='done' then 1 else 0 end) as done,
                  count(*) as total
             from onboarding_tasks
            where project_id=$1
            group by step_id) t on t.step_id = s.id
        where s.project_id=$1
        order by s.order_index asc`, [pid]
    );
    const steps = stepsResult.rows || [];

    const soonResult = await pool.query(
      `select title, owner, due_at as "dueAt" from onboarding_tasks
        where project_id=$1 and status<>'done' and due_at between now() and now() + interval '7 days'
        order by due_at asc limit 10`, [pid]
    );
    const soon = soonResult.rows || [];

    const overdueResult = await pool.query(
      `select title, owner, due_at as "dueAt" from onboarding_tasks
        where project_id=$1 and status<>'done' and due_at < now()
        order by due_at desc limit 10`, [pid]
    );
    const overdue = overdueResult.rows || [];

    const reflectionsResult = await pool.query(
      `select content, created_at as "createdAt" from onboarding_reflections
        where project_id=$1 and created_at >= now() - ($2 || ' days')::interval
        order by created_at desc limit 3`, [pid, String(lookback)]
    );
    const reflections = reflectionsResult.rows || [];

    const metricsResult = await pool.query(
      `select name, owner, target, current, status from onboarding_metrics
        where project_id=$1 order by created_at desc limit 8`, [pid]
    );
    const metrics = metricsResult.rows || [];

    res.json({ ok:true, steps, soon, overdue, reflections, metrics });
  } catch (err: any) {
    // Handle missing table gracefully
    if (err.code === '42P01') { // relation does not exist
      res.json({ ok:true, steps: [], soon: [], overdue: [], reflections: [], metrics: [] });
    } else {
      throw err;
    }
  }
});

export default od;
