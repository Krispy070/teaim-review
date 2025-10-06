import { Router } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";

export const dashboard = Router();

dashboard.get("/", async (req, res, next) => {
  try {
    const projectId = String((req.query.projectId||"")).trim();
    if (!projectId) return res.status(400).json({ error: "projectId required" });

    const [{ rows: a }, { rows: b }, { rows: c }, { rows: d }] = await Promise.all([
      db.execute(sql`select count(*)::int as docs, coalesce(sum((size_bytes)::bigint),0)::text as bytes
                     from docs where project_id=${projectId} and deleted_at is null`),
      db.execute(sql`select count(*)::int as actions,
                            sum(case when status in ('done','archived') then 1 else 0 end)::int as done
                     from actions where project_id=${projectId}`),
      db.execute(sql`select count(*)::int as tests from test_cases where project_id=${projectId}`),
      db.execute(sql`select count(*)::int as decisions from decisions where project_id=${projectId}`),
    ]);

    const { rows: rec } = await db.execute(sql`
      with recent_docs as (
        select id, name, created_at
        from docs where project_id=${projectId} and deleted_at is null
        order by created_at desc limit 5
      ),
      recent_actions as (
        select id, title, status, created_at
        from actions where project_id=${projectId}
        order by created_at desc limit 5
      ),
      recent_events as (
        select id, title, type, starts_at as "startsAt", created_at
        from timeline_events where project_id=${projectId}
        order by coalesce(starts_at, created_at) desc limit 5
      )
      select json_build_object(
        'docs',     (select coalesce(json_agg(rd), '[]'::json) from recent_docs rd),
        'actions',  (select coalesce(json_agg(ra), '[]'::json) from recent_actions ra),
        'events',   (select coalesce(json_agg(re), '[]'::json) from recent_events re)
      ) as data
    `);

    res.json({
      ok: true,
      counts: {
        docs: a?.[0]?.docs ?? 0,
        bytes: a?.[0]?.bytes ?? "0",
        actions: b?.[0]?.actions ?? 0,
        actionsDone: b?.[0]?.done ?? 0,
        tests: c?.[0]?.tests ?? 0,
        decisions: d?.[0]?.decisions ?? 0,
      },
      recent: rec?.[0]?.data ?? { docs:[], actions:[], events:[] }
    });
  } catch (e) { 
    next(e); 
  }
});
