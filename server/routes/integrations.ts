import { Router } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { clampInt } from "../lib/validate";
import { csvSafe, setDownloadHeaders } from "../lib/csv";
import { requireProject } from "../auth/projectAccess";

const integ = Router();

/* GET /api/integrations?projectId=&system=&status=&q=&limit=30&offset=0 */
integ.get("/", requireProject("member"), async (req,res)=>{
  const pid   = String(req.query.projectId||"");
  const sys   = String(req.query.system||"");
  const st    = String(req.query.status||"");
  const q     = `%${String(req.query.q||"").toLowerCase()}%`;

  const limit  = clampInt(req.query.limit, 1, 100, 30);
  const offset = Math.max(0, Number(req.query.offset||"0")|0);

  let query = sql`
    select id, name, system, status, owner, run_freq as "runFreq", last_run_at as "lastRunAt", created_at as "createdAt"
    from integrations
    where project_id=${pid}
  `;
  
  if (sys) query = sql`${query} and system=${sys}`;
  if (st) query = sql`${query} and status=${st}`;
  if (q !== '%%') query = sql`${query} and (lower(name) like ${q} or lower(system) like ${q} or lower(coalesce(description,'')) like ${q})`;
  
  query = sql`${query} order by created_at desc limit ${limit} offset ${offset}`;

  const items = (await db.execute(query)).rows;

  let countQuery = sql`select count(*)::int as n from integrations where project_id=${pid}`;
  if (sys) countQuery = sql`${countQuery} and system=${sys}`;
  if (st) countQuery = sql`${countQuery} and status=${st}`;
  if (q !== '%%') countQuery = sql`${countQuery} and (lower(name) like ${q} or lower(system) like ${q} or lower(coalesce(description,'')) like ${q})`;

  const filtered = (await db.execute(countQuery)).rows?.[0]?.n || 0;

  const total = (await db.execute(sql`
    select count(*)::int as n from integrations where project_id=${pid}
  `)).rows?.[0]?.n || 0;

  res.json({ ok:true, items, meta:{ limit, offset, filtered, total } });
});

/* GET /api/integrations/export.csv?projectId=&system=&status=&q= */
integ.get("/export.csv", requireProject("member"), async (req,res)=>{
  const pid   = String(req.query.projectId||"");
  const sys   = String(req.query.system||"");
  const st    = String(req.query.status||"");
  const q     = `%${String(req.query.q||"").toLowerCase()}%`;

  let query = sql`
    select name, system, status, owner, run_freq as "runFreq", last_run_at as "lastRunAt", created_at as "createdAt"
    from integrations
    where project_id=${pid}
  `;
  
  if (sys) query = sql`${query} and system=${sys}`;
  if (st) query = sql`${query} and status=${st}`;
  if (q !== '%%') query = sql`${query} and (lower(name) like ${q} or lower(system) like ${q} or lower(coalesce(description,'')) like ${q})`;
  
  query = sql`${query} order by created_at desc`;

  const rows = (await db.execute(query)).rows;

  setDownloadHeaders(res, `integrations-${pid}.csv`);
  const head="name,system,status,owner,runFreq,lastRunAt,createdAt";
  const out = rows.map((r:any)=>[
    r.name, r.system, r.status, r.owner||"", r.runFreq||"", r.lastRunAt||"", r.createdAt
  ].map(csvSafe).join(","));
  res.end([head, ...out].join("\r\n"));
});

export default integ;
