import { Router } from "express";
import { db } from "../db/client";
import { requireProject } from "../auth/projectAccess";
import { sql as sqlTag } from "drizzle-orm";

export const dc = Router();

/** GET /api/insights/decisions?projectId=&originType=&q=&limit=30&offset=0 */
dc.get("/", requireProject("member"), async (req,res)=>{
  const pid   = String(req.query.projectId||"");
  const otype = String(req.query.originType||"");
  const q     = String(req.query.q||"").toLowerCase();
  const limitRaw = Number.parseInt(String(req.query.limit||"30"), 10);
  const offsetRaw = Number.parseInt(String(req.query.offset||"0"), 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, limitRaw)) : 30;
  const offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0;

  let query = sqlTag`
    select id, title, description, decided_by as "decidedBy", area, status,
           origin_type as "originType", origin_id as "originId", created_at as "createdAt"
    from decisions
    where project_id = ${pid}
  `;

  if (otype) {
    query = sqlTag`${query} and origin_type = ${otype}`;
  }
  if (q) {
    query = sqlTag`${query} and (lower(title) like ${`%${q}%`} or lower(description) like ${`%${q}%`})`;
  }

  query = sqlTag`${query} order by created_at desc limit ${limit} offset ${offset}`;

  const result: any = await db.execute(query);
  const rows = result.rows || result;
  res.json({ ok:true, items: rows||[], meta:{ limit, offset } });
});

/** GET /api/insights/decisions/export.csv?projectId=&originType=&q= */
dc.get("/export.csv", requireProject("member"), async (req,res)=>{
  const pid   = String(req.query.projectId||"");
  const otype = String(req.query.originType||"");
  const q     = String(req.query.q||"").toLowerCase();

  let query = sqlTag`
    select title, description, decided_by as "decidedBy", area, status,
           origin_type as "originType", origin_id as "originId", created_at as "createdAt"
    from decisions
    where project_id = ${pid}
  `;

  if (otype) {
    query = sqlTag`${query} and origin_type = ${otype}`;
  }
  if (q) {
    query = sqlTag`${query} and (lower(title) like ${`%${q}%`} or lower(description) like ${`%${q}%`})`;
  }

  query = sqlTag`${query} order by created_at desc limit 5000`;

  const result: any = await db.execute(query);
  const rows = result.rows || result;
  const esc = (v:any)=>`"${String(v??"").replace(/"/g,'""')}"`;
  const lines = [
    "title,description,decidedBy,area,status,originType,originId,createdAt",
    ...rows.map((r:any)=>[r.title,r.description||"",r.decidedBy||"",r.area||"",r.status||"",r.originType||"",r.originId||"",r.createdAt].map(esc).join(","))
  ].join("\r\n");
  res.type("text/csv").send(lines);
});

export default dc;
