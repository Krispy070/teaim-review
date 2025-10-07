import { Router } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { clampInt } from "../lib/validate";
import { requireProject } from "../auth/projectAccess";

const risks = Router();

/* GET /api/risks?projectId=&status=&owner=&q=&limit=30&offset=0 */
risks.get("/", requireProject("member"), async (req,res)=>{
  const pid = String(req.query.projectId||"");
  const st  = String(req.query.status||"");
  const ow  = String(req.query.owner||"");
  const q   = String(req.query.q||"").toLowerCase();

  const limit  = clampInt(req.query.limit, 1, 100, 30);
  const offset = Math.max(0, Number(req.query.offset||"0")|0);

  let whereClause = sql`project_id=${pid}`;
  if (st) whereClause = sql`${whereClause} and status=${st}`;
  if (ow) whereClause = sql`${whereClause} and owner ilike ${'%'+ow+'%'}`;
  if (q)  whereClause = sql`${whereClause} and (lower(title) like ${'%'+q+'%'} or lower(coalesce(summary,'')) like ${'%'+q+'%'})`;

  const items = await db.execute(sql`
    select id, title, severity, owner, status, created_at as "createdAt"
    from risks where ${whereClause}
    order by created_at desc
    limit ${limit} offset ${offset}
  `);

  const filteredRes = await db.execute(sql`
    select count(*)::int as n from risks where ${whereClause}
  `);
  const filtered = filteredRes.rows?.[0]?.n || 0;

  const totalRes = await db.execute(sql`
    select count(*)::int as n from risks where project_id=${pid}
  `);
  const total = totalRes.rows?.[0]?.n || 0;

  res.json({ ok:true, items: items.rows, meta:{ limit, offset, filtered, total } });
});

export default risks;
