import { Router } from "express";
import { db } from "../db/client";
import { requireProject } from "../auth/projectAccess";
import { sql } from "drizzle-orm";

export const pcounts = Router();

/* GET /api/plan/my_counts?projectId=&owner=&days=7
   -> { dueSoon:int, overdue:int }
*/
pcounts.get("/my_counts", requireProject("member"), async (req,res)=>{
  const pid   = String(req.query.projectId||"");
  const owner = String(req.query.owner||"").toLowerCase();
  const days  = Math.min(60, Math.max(1, Number(req.query.days||"7")));

  try {
    const planResult = await db.execute(
      sql`select id from project_plans where project_id=${pid} and is_active=true order by created_at desc limit 1`
    );
    const planRows = (planResult as any).rows || planResult || [];
    const plan = planRows[0];

    if (!plan) return res.json({ ok:true, dueSoon:0, overdue:0 });

    let dueSoon = 0;
    let overdue = 0;

    if (owner){
      const dueSoonResult = await db.execute(
        sql`select count(*)::int as n
           from plan_tasks
          where project_id=${pid}
            and plan_id=${plan.id}
            and status <> 'done'
            and owner is not null
            and lower(owner) like ${`%${owner}%`}
            and due_at between now() and now() + (${days} || ' days')::interval`
      );
      dueSoon = ((dueSoonResult as any).rows || dueSoonResult || [])[0]?.n || 0;

      const overdueResult = await db.execute(
        sql`select count(*)::int as n
           from plan_tasks
          where project_id=${pid}
            and plan_id=${plan.id}
            and status <> 'done'
            and owner is not null
            and lower(owner) like ${`%${owner}%`}
            and due_at < now()`
      );
      overdue = ((overdueResult as any).rows || overdueResult || [])[0]?.n || 0;
    } else {
      const dueSoonResult = await db.execute(
        sql`select count(*)::int as n
           from plan_tasks
          where project_id=${pid}
            and plan_id=${plan.id}
            and status <> 'done'
            and owner is not null
            and due_at between now() and now() + (${days} || ' days')::interval`
      );
      dueSoon = ((dueSoonResult as any).rows || dueSoonResult || [])[0]?.n || 0;

      const overdueResult = await db.execute(
        sql`select count(*)::int as n
           from plan_tasks
          where project_id=${pid}
            and plan_id=${plan.id}
            and status <> 'done'
            and owner is not null
            and due_at < now()`
      );
      overdue = ((overdueResult as any).rows || overdueResult || [])[0]?.n || 0;
    }

    res.json({ ok:true, dueSoon, overdue });
  } catch (err) {
    console.error('Error in my_counts:', err);
    res.json({ ok:true, dueSoon:0, overdue:0 });
  }
});

export default pcounts;
