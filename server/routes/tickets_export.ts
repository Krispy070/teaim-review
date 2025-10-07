import { Router } from "express";
import { exec } from "../db/exec";
import { csvSafe, setDownloadHeaders } from "../lib/csv";
import { requireProject } from "../auth/projectAccess";

const texp = Router();

texp.get("/export.csv", requireProject("member"), async (req,res)=>{
  const pid   = String(req.query.projectId||"");
  const st    = String(req.query.status||"");
  const pr    = String(req.query.priority||"");
  const asg   = String(req.query.assignee||"");
  const q     = String(req.query.q||"").toLowerCase();

  const where:string[] = [`project_id=$1`]; const params:any[]=[pid];
  if (st)  where.push(`status=$${params.length+1}`),   params.push(st);
  if (pr)  where.push(`priority=$${params.length+1}`), params.push(pr);
  if (asg) where.push(`assignee ilike $${params.length+1}`), params.push(`%${asg}%`);
  if (q)   where.push(`(lower(title) like $${params.length+1} or lower(description) like $${params.length+1})`), params.push(`%${q}%`);

  const rows = (await exec(
    `select title, status, priority, assignee, external_system as "system", external_key as "key", external_url as "url", created_at as "createdAt"
       from tickets where ${where.join(" and ")} order by created_at desc`, params, 12_000, "tickets:export"
  )).rows;

  setDownloadHeaders(res, `tickets-${pid}.csv`);
  const head = "title,status,priority,assignee,system,key,url,createdAt";
  const out = rows.map((r:any)=>[
    r.title, r.status, r.priority, r.assignee||"", r.system||"", r.key||"", r.url||"", r.createdAt
  ].map(csvSafe).join(","));
  res.end([head, ...out].join("\r\n"));
});

export default texp;
