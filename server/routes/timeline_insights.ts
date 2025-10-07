import { Router } from "express";
import { db } from "../db/client";
import { sql as sqlTag } from "drizzle-orm";
import { exec } from "../db/exec";
import { clampInt } from "../lib/validate";
import { requireProject } from "../auth/projectAccess";

export const tl = Router();

/** GET /api/insights/timeline?projectId=&originType=&q=&limit=30&offset=0 */
tl.get("/", requireProject("member"), async (req,res)=>{
  const pid   = String(req.query.projectId||"");
  const otype = String(req.query.originType||"");                    // "", "doc", "conversation", "meeting"
  const q     = String(req.query.q||"").toLowerCase();
  const limit = clampInt(req.query.limit, 1, 100, 30);
  const offset= Math.max(0, Number(req.query.offset||"0")|0);

  const where:string[]=[`project_id=$1`]; const params:any[]=[pid];
  if (otype) { where.push(`origin_type=$${params.length+1}`); params.push(otype); }
  if (q) { where.push(`lower(title) like $${params.length+1}`); params.push(`%${q}%`); }

  const items = (await exec(
    `select id, title, type, starts_at as "startsAt", ends_at as "endsAt", confidence,
            origin_type as "originType", origin_id as "originId", doc_id as "docId",
            created_at as "createdAt"
       from timeline_events
      where ${where.join(" and ")}
      order by coalesce(starts_at, created_at) desc
      limit ${limit} offset ${offset}`, params, 12_000, "timeline:list"
  )).rows;

  const filtered = (await exec(
    `select count(*)::int as n from timeline_events where ${where.join(" and ")}`, params, 12_000, "timeline:count"
  )).rows?.[0]?.n || 0;

  res.json({ ok:true, items, meta:{ limit, offset, filtered } });
});

/** GET /api/insights/timeline/export.csv?projectId=&originType=&q= */
tl.get("/export.csv", requireProject("member"), async (req,res)=>{
  const pid   = String(req.query.projectId||"");
  const otype = String(req.query.originType||"");
  const q     = String(req.query.q||"").toLowerCase();

  let query = sqlTag`
    select title, type, starts_at as "startsAt", ends_at as "endsAt",
           origin_type as "originType", origin_id as "originId", created_at as "createdAt"
    from timeline_events
    where project_id = ${pid}
  `;

  if (otype) {
    query = sqlTag`${query} and origin_type = ${otype}`;
  }
  if (q) {
    query = sqlTag`${query} and lower(title) like ${`%${q}%`}`;
  }

  query = sqlTag`${query} order by coalesce(starts_at, created_at) desc limit 5000`;

  const result: any = await db.execute(query);
  const rows = result.rows || result;
  const esc = (v:any)=>`"${String(v??"").replace(/"/g,'""')}"`;
  const lines = [
    "title,type,startsAt,endsAt,originType,originId,createdAt",
    ...rows.map((r:any)=>[r.title,r.type,r.startsAt||"",r.endsAt||"",r.originType||"",r.originId||"",r.createdAt].map(esc).join(","))
  ].join("\r\n");
  res.type("text/csv").send(lines);
});

export default tl;
