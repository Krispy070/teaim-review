import { Router } from "express";
import { sql } from "drizzle-orm";
import { requireProject } from "../auth/projectAccess";
import { db } from "../db/client";

export const audit = Router();

audit.get("/", requireProject("admin"), async (req, res) => {
  const pid = String(req.query.projectId||"");
  const entity = String(req.query.entity||"");
  const user = String(req.query.user||"");
  const dateFrom = String(req.query.dateFrom||"");
  const dateTo = String(req.query.dateTo||"");
  const limit = Math.min(500, Math.max(1, Number(req.query.limit||"200")));

  let query = sql`
    select id, user_email as "userEmail", action, entity, entity_id as "entityId",
           route, changes, created_at as "createdAt"
    from audit_log
    where project_id = ${pid}
  `;
  
  if (entity) query = sql`${query} and entity = ${entity}`;
  if (user) query = sql`${query} and user_email ilike ${`%${user}%`}`;
  if (dateFrom) query = sql`${query} and created_at >= ${dateFrom}::date`;
  if (dateTo) query = sql`${query} and created_at < (${dateTo}::date + interval '1 day')`;
  
  query = sql`${query} order by created_at desc limit ${limit}`;
  
  const result: any = await db.execute(query);
  const rows = result.rows || result || [];
  res.json({ ok:true, items: rows });
});

audit.get("/export.csv", requireProject("admin"), async (req, res) => {
  const pid = String(req.query.projectId||"");
  const result: any = await db.execute(sql`
    select created_at as "createdAt", user_email as "userEmail", action, entity, entity_id as "entityId", route, changes
    from audit_log where project_id=${pid} order by created_at desc limit 2000
  `);
  const rows = result.rows || result || [];
  const esc = (s:any)=>`"${String(s??"").replace(/"/g,'""')}"`;
  const header = "createdAt,userEmail,action,entity,entityId,route,changes";
  const lines = rows.map((r:any)=>[
    r.createdAt, r.userEmail||"", r.action, r.entity, r.entityId||"", r.route||"", JSON.stringify(r.changes||{})
  ].map(esc).join(","));
  res.setHeader("Content-Type","text/csv; charset=utf-8");
  res.setHeader("Content-Disposition",`attachment; filename="audit_${pid}.csv"`);
  res.send([header, ...lines].join("\r\n"));
});
