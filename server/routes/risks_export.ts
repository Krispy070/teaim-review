import { Router } from "express"; 
import { exec } from "../db/exec";
import { csvSafe, setDownloadHeaders } from "../lib/csv"; 
import { requireProject } from "../auth/projectAccess";

const rexp = Router();
/* GET /api/risks/export.csv?projectId=&q= */
rexp.get("/export.csv", requireProject("member"), async (req,res)=>{
  const pid = String(req.query.projectId||""); 
  const q=String(req.query.q||"").toLowerCase();
  const where=[`project_id=$1`]; 
  const p:any[]=[pid];
  if (q) { 
    where.push(`(lower(title) like $${p.length+1} or lower(coalesce(summary,'')) like $${p.length+1})`); 
    p.push(`%${q}%`); 
  }
  const rows = (await exec(
    `select title, severity, owner, status, created_at as "createdAt" from risks where ${where.join(" and ")} order by created_at desc limit 5000`,
    p, 12_000, "risks:export"
  )).rows;
  setDownloadHeaders(res, `risks-${pid}.csv`);
  const head="title,severity,owner,status,createdAt";
  const out = rows.map((r:any)=>[r.title,r.severity||"",r.owner||"",r.status||"",r.createdAt].map(csvSafe).join(","));
  res.end([head, ...out].join("\r\n"));
});
export default rexp;
