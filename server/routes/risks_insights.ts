import { Router } from "express";
import { db } from "../db/client";
import { sql as sqlTag } from "drizzle-orm";
import { exec } from "../db/exec";
import { clampInt } from "../lib/validate";
import { requireProject } from "../auth/projectAccess";

export const rx = Router();

/** GET /api/insights/risks?projectId=&originType=&q=&limit=30&offset=0 */
rx.get("/", requireProject("member"), async (req,res)=>{
  const pid   = String(req.query.projectId||"");
  const otype = String(req.query.originType||"");
  const q     = String(req.query.q||"").toLowerCase();
  const limit = clampInt(req.query.limit, 1, 100, 30);
  const offset= Math.max(0, Number(req.query.offset||"0")|0);

  const where:string[]=[`project_id=$1`]; const params:any[]=[pid];
  if (otype) { where.push(`origin_type=$${params.length+1}`); params.push(otype); }
  if (q) { where.push(`(lower(title) like $${params.length+1} or lower(coalesce(description,'')) like $${params.length+1})`); params.push(`%${q}%`); }

  const items = (await exec(
    `select id, title, description, probability, impact, severity, owner, mitigation, status,
            origin_type as "originType", origin_id as "originId", created_at as "createdAt"
       from risks
      where ${where.join(" and ")}
      order by severity desc, created_at desc
      limit ${limit} offset ${offset}`, params, 12_000, "risks:list"
  )).rows;

  const filtered = (await exec(
    `select count(*)::int as n from risks where ${where.join(" and ")}`, params, 12_000, "risks:count"
  )).rows?.[0]?.n || 0;

  res.json({ ok:true, items, meta:{ limit, offset, filtered } });
});

/** GET /api/insights/risks/export.csv?projectId=&originType=&q= */
rx.get("/export.csv", requireProject("member"), async (req,res)=>{
  const pid   = String(req.query.projectId||"");
  const otype = String(req.query.originType||"");
  const q     = String(req.query.q||"").toLowerCase();

  let query = sqlTag`
    select title, probability, impact, severity, owner, status, 
           origin_type as "originType", origin_id as "originId", created_at as "createdAt"
    from risks
    where project_id = ${pid}
  `;

  if (otype) {
    query = sqlTag`${query} and origin_type = ${otype}`;
  }
  if (q) {
    query = sqlTag`${query} and (lower(title) like ${`%${q}%`} or lower(description) like ${`%${q}%`})`;
  }

  query = sqlTag`${query} order by severity desc, created_at desc limit 5000`;

  const result: any = await db.execute(query);
  const rows = result.rows || result;
  const esc = (v:any)=>`"${String(v??"").replace(/"/g,'""')}"`;
  const lines = [
    "title,probability,impact,severity,owner,status,originType,originId,createdAt",
    ...rows.map((r:any)=>[r.title,r.probability,r.impact,r.severity,r.owner||"",r.status||"",r.originType||"",r.originId||"",r.createdAt].map(esc).join(","))
  ].join("\r\n");
  res.type("text/csv").send(lines);
});

export default rx;
