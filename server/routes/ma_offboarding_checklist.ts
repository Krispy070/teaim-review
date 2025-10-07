import { Router } from "express";
import { db } from "../db/client";
import fetch from "node-fetch";
import { requireProject } from "../auth/projectAccess";
import { sql } from "drizzle-orm";

export const offchk = Router();

offchk.post("/cohorts/:id/offboarding/post-checklist", requireProject("member"), async (req,res)=>{
  const cid = String(req.params.id||"");
  const { projectId, category="plan", limit=30 } = req.body||{};
  if (!projectId || !cid) return res.status(400).json({ error:"projectId & cohortId" });

  const cohResult = await db.execute(sql`select name,type from cohorts where id=${cid}`);
  const coh = (cohResult as any).rows?.[0];

  const lim = Math.min(30, Math.max(1, Number(limit||30)));
  const rowsResult = await db.execute(
    sql`select name, email, owner, status, coalesce(terminate_date, last_day) as "dueAt"
       from offboarding_rows
      where cohort_id=${cid}
   order by
      case when coalesce(terminate_date,last_day) < now() and status<>'done' then 0 else 1 end,
      case when status='blocked' then 0 else 1 end,
      case when coalesce(terminate_date,last_day) between now() and now()+ interval '7 days' and status<>'done' then 0 else 1 end,
      coalesce(terminate_date,last_day) asc nulls last, updated_at desc
      limit ${lim}`
  );
  const rows = (rowsResult as any).rows || [];

  const em = (s:string)=> (s==="done"?"✅" : s==="blocked"?"⛔" : s==="in_progress"?"🔵" : "☐");
  const lines = [`Offboarding Checklist — ${coh?.name||cid} (${coh?.type||"cohort"})`];
  rows.forEach((r:any)=>{
    const due = r.dueAt ? ` • ${new Date(r.dueAt).toLocaleDateString()}` : "";
    const own = r.owner ? ` • ${r.owner}` : "";
    const who = r.name || r.email || "(user)";
    lines.push(`${em(r.status)} ${who}${own}${due}`);
  });

  await fetch(`http://localhost:${process.env.PORT||5000}/api/messaging/post`, {
    method:"POST", headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ projectId, category, text: lines.join("\n") })
  }).catch(()=>{});

  res.json({ ok:true, posted: rows.length });
});

export default offchk;
