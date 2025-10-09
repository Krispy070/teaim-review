import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { handleWorkerError, workersDisabled } from "./utils";

export function startRetentionWorker() {
  const every = Math.max(5, Number(process.env.RETENTION_SWEEP_MINUTES || 60));
  console.log(`[retention] sweep every ${every} min`);
  setInterval(async () => {
    if (workersDisabled()) return;
    try {
      // originals: clear storagePath after N days (keep redacted text)
      await db.execute(sql`
        with cfg as (
          select project_id, retention_original_days as d
          from project_settings where retention_original_days > 0
        ),
        tgt as (
          select d.id, d.storage_path, d.project_id
          from docs d join cfg on cfg.project_id = d.project_id
          where d.storage_path is not null and d.created_at < now() - (cfg.d || ' days')::interval
        )
        update docs set storage_path = null
        where id in (select id from tgt)
      `);

      // hard delete docs after docDays (optional)
      const { rows: del } = await db.execute(sql`
        select d.id, d.project_id from docs d
        join project_settings p on p.project_id = d.project_id
        where p.retention_doc_days > 0
          and p.retention_hard_delete = true
          and d.created_at < now() - (p.retention_doc_days || ' days')::interval
      `) as any;
      if (del?.length) {
        const ids = del.map((r:any)=>r.id);
        await db.execute(sql`delete from doc_chunks where doc_id = any(${ids}::uuid[])`);
        await db.execute(sql`delete from timeline_events where doc_id = any(${ids}::uuid[])`);
        await db.execute(sql`delete from actions where doc_id = any(${ids}::uuid[])`);
        await db.execute(sql`delete from decisions where doc_id = any(${ids}::uuid[])`);
        await db.execute(sql`delete from test_cases where doc_id = any(${ids}::uuid[])`);
        await db.execute(sql`delete from docs where id = any(${ids}::uuid[])`);
      }
    } catch (e) {
      handleWorkerError("retention", e);
    }
  }, every * 60 * 1000);
}
