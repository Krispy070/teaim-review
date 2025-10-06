import { Router } from "express";
import { sql } from "drizzle-orm";
import { requireProject } from "../auth/projectAccess";
import { db } from "../db/client";

export const ops = Router();

ops.get("/health", requireProject("admin"), async (_req, res) => {
  const [e, p, hb] = await Promise.all([
    db.execute(sql`select status, count(*)::int as n from embed_jobs group by status`),
    db.execute(sql`select status, count(*)::int as n from parse_jobs group by status`),
    db.execute(sql`select worker, info, updated_at as "updatedAt" from worker_heartbeat order by worker`),
  ]);
  const embedRows = (e as any).rows || e || [];
  const parseRows = (p as any).rows || p || [];
  const hbRows = (hb as any).rows || hb || [];
  res.json({ ok:true, embed:embedRows, parse:parseRows, heartbeats: hbRows });
});

ops.get("/jobs", requireProject("admin"), async (req, res) => {
  const type = String(req.query.type||"embed");
  const status = String(req.query.status||"pending");
  const pid = String(req.query.projectId||"");
  const tableName = type==="parse" ? "parse_jobs" : "embed_jobs";
  
  let query = sql`
    select id, project_id as "projectId", doc_id as "docId", attempts, last_error as "lastError", 
           created_at as "createdAt", updated_at as "updatedAt"
    from ${sql.identifier(tableName)}
    where status = ${status}
  `;
  
  if (pid) query = sql`${query} and project_id = ${pid}`;
  query = sql`${query} order by updated_at desc limit 200`;
  
  const result: any = await db.execute(query);
  const rows = result.rows || result || [];
  res.json({ ok:true, items: rows });
});

ops.post("/retry", requireProject("admin"), async (req, res) => {
  const { type="embed", jobId, projectId, allFailed } = req.body||{};
  const tableName = type==="parse" ? "parse_jobs" : "embed_jobs";
  
  if (jobId) {
    await db.execute(sql`
      update ${sql.identifier(tableName)} 
      set status='pending', last_error=null, updated_at=now() 
      where id=${jobId}
    `);
    return res.json({ ok:true, retried:1 });
  }
  
  if (allFailed) {
    if (projectId) {
      await db.execute(sql`
        update ${sql.identifier(tableName)} 
        set status='pending', last_error=null, updated_at=now() 
        where status='failed' and project_id=${projectId}
      `);
    } else {
      await db.execute(sql`
        update ${sql.identifier(tableName)} 
        set status='pending', last_error=null, updated_at=now() 
        where status='failed'
      `);
    }
    return res.json({ ok:true, retried:"allFailed" });
  }
  
  res.status(400).json({ ok:false, error:"jobId or allFailed required" });
});
