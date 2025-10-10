import { Router } from "express";
import { pool } from "../db/client";
import { requireProject } from "../auth/projectAccess";

export const pcounts = Router();

/* GET /api/plan/my_counts?projectId=&owner=&days=7
   -> { dueSoon:int, overdue:int }
*/
pcounts.get("/my_counts", requireProject("member"), async (req,res)=>{
  const pid   = String(req.query.projectId||"");
  const owner = String(req.query.owner||"").toLowerCase();
  const days  = Math.min(60, Math.max(1, Number(req.query.days||"7")));

  try {
    const planResult = await pool.query(
      `select id from project_plans where project_id=$1 and is_active=true order by created_at desc limit 1`,
      [pid]
    );
    const plan = planResult.rows?.[0];

    if (!plan) return res.json({ ok:true, dueSoon:0, overdue:0 });

    const where = [`project_id=$1`,`plan_id=$2`,`status <> 'done'`,`owner is not null`];
    const params:any[] = [pid, plan.id];

    if (owner){
      where.push(`lower(owner) like $${params.length+1}`); params.push(`%${owner}%`);
    }

    const dueSoonResult = await pool.query(
      `select count(*)::int as n
         from plan_tasks
        where ${where.join(" and ")}
          and due_at between now() and now() + ($${params.length+1} || ' days')::interval`,
      [...params, String(days)]
    );
    const dueSoon = dueSoonResult.rows?.[0]?.n || 0;

    const overdueResult = await pool.query(
      `select count(*)::int as n
         from plan_tasks
        where ${where.join(" and ")}
          and due_at < now()`,
      params
    );
    const overdue = overdueResult.rows?.[0]?.n || 0;

    res.json({ ok:true, dueSoon, overdue });
  } catch (err: any) {
    // Handle missing table gracefully
    if (err.code === '42P01') { // relation does not exist
      res.json({ ok:true, dueSoon:0, overdue:0 });
    } else {
      throw err;
    }
  }
});

export default pcounts;
