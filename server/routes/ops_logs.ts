import { Router } from "express";
import { requireProject } from "../auth/projectAccess";
import { db } from "../db/client";
import { sql } from "drizzle-orm";

export const opsLogs = Router();

// GET /api/ops/logs?projectId=&level=&route=&since=&limit=
opsLogs.get("/logs", requireProject("admin"), async (req, res) => {
  const pid = String(req.query.projectId||"");
  const level = String(req.query.level||"");   // error|warn
  const route = String(req.query.route||"");
  const since = String(req.query.since||"");   // YYYY-MM-DD
  const limit = Math.min(1000, Math.max(1, Number(req.query.limit||"300")));

  // Build dynamic WHERE clauses
  const conditions = [sql`1=1`];
  if (pid) conditions.push(sql`project_id = ${pid}`);
  if (level) conditions.push(sql`level = ${level}`);
  if (route) conditions.push(sql`route ilike ${`%${route}%`}`);
  if (since) conditions.push(sql`created_at >= ${since}`);

  const whereSql = sql.join(conditions, sql` and `);

  const { rows } = await db.execute(
    sql`select created_at as "createdAt", level, message, route, method, status, user_email as "userEmail", detail
       from error_log where ${whereSql}
       order by created_at desc
       limit ${limit}`
  );
  res.json({ ok:true, items: rows||[] });
});

// quick metrics aggregates (last 15 minutes)
opsLogs.get("/metrics", requireProject("admin"), async (_req, res) => {
  const { rows: a } = await db.execute(
    sql`select route, method, count(*)::int as n, avg(dur_ms)::int as avg, percentile_disc(0.95) within group (order by dur_ms)::int as p95
       from request_metrics
      where created_at >= now() - interval '15 minutes'
      group by 1,2
      order by n desc
      limit 100`
  );
  res.json({ ok:true, routes: a||[] });
});

// GET /api/ops/overview
opsLogs.get("/overview", requireProject("admin"), async (req, res) => {
  const pid = String(req.query.projectId || "");
  // errors (filtered by project)
  const [{ rows: e15 }, { rows: e60 }] = await Promise.all([
    db.execute(sql`select count(*)::int as n from error_log where project_id = ${pid} and created_at >= now() - interval '15 minutes'`),
    db.execute(sql`select count(*)::int as n from error_log where project_id = ${pid} and created_at >= now() - interval '60 minutes'`),
  ]);
  // rpm over last 15 min (global metrics - request_metrics has no project_id column)
  const { rows: rpm } = await db.execute(
    sql`select date_trunc('minute', created_at) as ts, count(*)::int as n
       from request_metrics
      where created_at >= now() - interval '15 minutes'
      group by 1
      order by 1 asc`
  );
  res.json({ ok:true, errors15: e15?.[0]?.n||0, errors60: e60?.[0]?.n||0, rpm });
});
