import { Router } from "express";
import { db } from "../db/client";
import { requireProject } from "../auth/projectAccess";

export const et = Router();

/* GET /api/email/metrics/trend24?projectId=
   -> { points:[{t:string, attempted:int, bounced:int, complained:int}] }
*/
et.get("/metrics/trend24", requireProject("member"), async (req,res)=>{
  const pid = String(req.query.projectId||"");

  const rows = (await db.execute(
    `select date_trunc('hour', created_at) as h,
            sum(case when status='sent'       then 1 else 0 end)::int as attempted,
            sum(case when status='bounced'    then 1 else 0 end)::int as bounced,
            sum(case when status='complained' then 1 else 0 end)::int as complained
       from email_events
      where (project_id is null or project_id=$1)
        and created_at >= now() - interval '24 hours'
      group by h
      order by h`, [pid] as any
  )).rows || [];

  const points = rows.map((r:any)=>({
    t: new Date(r.h).toISOString(),
    attempted: r.attempted||0, bounced: r.bounced||0, complained: r.complained||0
  }));
  res.json({ ok:true, points });
});

export default et;
