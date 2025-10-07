import { Router } from "express"; 
import { exec } from "../db/exec";
import { csvSafe, setDownloadHeaders } from "../lib/csv"; 
import { requireProject } from "../auth/projectAccess";

const dexp = Router();
/* GET /api/decisions/export.csv?projectId=&q= */
dexp.get("/export.csv", requireProject("member"), async (req,res)=>{
  const pid = String(req.query.projectId||""); 
  const q=String(req.query.q||"").toLowerCase();
  const where=[`project_id=$1`]; 
  const p:any[]=[pid];
  if (q) { 
    where.push(`(lower(title) like $${p.length+1} or lower(coalesce(summary,'')) like $${p.length+1})`); 
    p.push(`%${q}%`); 
  }
  const rows = (await exec(
    `select title, decided_by as "decidedBy", status, created_at as "createdAt" from decisions where ${where.join(" and ")} order by created_at desc limit 5000`,
    p, 12_000, "decisions:export"
  )).rows;
  setDownloadHeaders(res, `decisions-${pid}.csv`);
  const head="title,decidedBy,status,createdAt";
  const out = rows.map((r:any)=>[r.title,r.decidedBy||"",r.status||"",r.createdAt].map(csvSafe).join(","));
  res.end([head, ...out].join("\r\n"));
});
export default dexp;
