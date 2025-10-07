import { Router } from "express";
import { exec } from "../db/exec";
import { csvSafe, setDownloadHeaders } from "../lib/csv";
import { requireProject } from "../auth/projectAccess";

const texp = Router();
/* GET /api/timeline/export.csv?projectId=&type=&q= */
texp.get("/export.csv", requireProject("member"), async (req,res)=>{
  const pid = String(req.query.projectId||"");
  const type= String(req.query.type||"");
  const q   = String(req.query.q||"").toLowerCase();

  const where:string[]=[`project_id=$1`]; const params:any[]=[pid];
  if (type) where.push(`type=$${params.length+1}`), params.push(type);
  if (q)    where.push(`(lower(title) like $${params.length+1} or lower(coalesce(summary,'')) like $${params.length+1})`), params.push(`%${q}%`);

  const rows = (await exec(
    `select title, type, coalesce(starts_at, created_at) as ts, origin_type as "originType", origin_id as "originId"
       from timeline_events
      where ${where.join(" and ")} order by ts desc limit 5000`,
    params, 12_000, "timeline:export"
  )).rows;

  setDownloadHeaders(res, `timeline-${pid}.csv`);
  const head="when,title,type,originType,originId";
  const out = rows.map((r:any)=>[
    r.ts, r.title, r.type||"", r.originType||"", r.originId||""
  ].map(csvSafe).join(","));
  res.end([head, ...out].join("\r\n"));
});
export default texp;
