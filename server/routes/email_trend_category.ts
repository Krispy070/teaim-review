import { Router } from "express";
import { db } from "../db/client.js";
import { requireProject } from "../auth/projectAccess.js";

export const etc = Router();

etc.get("/metrics/trend24_by_category", requireProject("member"), async (req,res)=>{
  const pid = String(req.query.projectId||"");

  const cats = (await db.execute(
    `select distinct category from email_events
      where (project_id is null or project_id=$1)
        and created_at >= now() - interval '24 hours'`, [pid] as any
  )).rows.map((r:any)=>r.category||"(other)");

  const items:any[] = [];
  for (const c of cats){
    const rows = (await db.execute(
      `select date_trunc('hour', created_at) as h,
              sum(case when status='sent'       then 1 else 0 end)::int as attempted,
              sum(case when status='bounced'    then 1 else 0 end)::int as bounced,
              sum(case when status='complained' then 1 else 0 end)::int as complained
         from email_events
        where (project_id is null or project_id=$1)
          and created_at >= now() - interval '24 hours'
          and category = $2
        group by h
        order by h`, [pid, c] as any
    )).rows || [];
    items.push({
      category: c,
      points: rows.map((r:any)=>({ t:new Date(r.h).toISOString(), attempted:r.attempted||0, bounced:r.bounced||0, complained:r.complained||0 }))
    });
  }
  res.json({ ok:true, items });
});

export default etc;
