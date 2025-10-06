import { Router } from "express";
import { db } from "../db/client";
import { requireProject } from "../auth/projectAccess";

export const pcounts = Router();

/* GET /api/plan/my_counts?projectId=&owner=&days=7
   -> { dueSoon:int, overdue:int }
*/
pcounts.get("/my_counts", requireProject("member"), async (req,res)=>{
  const pid   = String(req.query.projectId||"");
  const owner = String(req.query.owner||"").toLowerCase();
  const days  = Math.min(60, Math.max(1, Number(req.query.days||"7")));

  const planResult = await db.execute(
    `select id from project_plans where project_id=$1 and is_active=true order by created_at desc limit 1`,
    [pid] as any
  );
  const plan = (planResult as any).rows?.[0];

  if (!plan) return res.json({ ok:true, dueSoon:0, overdue:0 });

  const where = [`project_id=$1`,`plan_id=$2`,`status <> 'done'`,`owner is not null`];
  const params:any[] = [pid, plan.id];

  if (owner){
    where.push(`lower(owner) like $${params.length+1}`); params.push(`%${owner}%`);
  }

  const dueSoonResult = await db.execute(
    `select count(*)::int as n
       from plan_tasks
      where ${where.join(" and ")}
        and due_at between now() and now() + ($${params.length+1} || ' days')::interval`,
    [...params, String(days)] as any
  );
  const dueSoon = (dueSoonResult as any).rows?.[0]?.n || 0;

  const overdueResult = await db.execute(
    `select count(*)::int as n
       from plan_tasks
      where ${where.join(" and ")}
        and due_at < now()`,
    params as any
  );
  const overdue = (overdueResult as any).rows?.[0]?.n || 0;

  res.json({ ok:true, dueSoon, overdue });
});

export default pcounts;
