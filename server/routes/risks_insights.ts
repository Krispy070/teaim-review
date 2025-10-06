import { Router } from "express";
import { db } from "../db/client";
import { requireProject } from "../auth/projectAccess";
import { sql as sqlTag } from "drizzle-orm";

export const rx = Router();

/** GET /api/insights/risks?projectId=&originType=&q=&limit=30&offset=0 */
rx.get("/", requireProject("member"), async (req,res)=>{
  const pid   = String(req.query.projectId||"");
  const otype = String(req.query.originType||"");
  const q     = String(req.query.q||"").toLowerCase();
  const limit = Math.min(100, Math.max(1, Number(req.query.limit||"30")));
  const offset= Math.max(0, Number(req.query.offset||"0"));

  let query = sqlTag`
    select id, title, description, probability, impact, severity, owner, mitigation, status,
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

  query = sqlTag`${query} order by severity desc, created_at desc limit ${limit} offset ${offset}`;

  const result: any = await db.execute(query);
  const rows = result.rows || result;
  res.json({ ok:true, items: rows||[], meta:{ limit, offset } });
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
