import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { beat } from "../lib/heartbeat";

/** Nightly auto-sweep of empty conversations (0 msgs) older than N days.
 * Uses project_settings:
 *  - conversation_sweep_enabled (bool)
 *  - conversation_sweep_days (int)
 *  - conversation_sweep_time_utc (HH:mm)
 *  - conversation_sweep_last_at (timestamp)
 */
export function startConversationSweepWorker() {
  setInterval(async () => {
    try {
      const { rows: projs } = await db.execute(
        sql`select project_id as "projectId",
                coalesce(conversation_sweep_enabled, true) as "enabled",
                coalesce(conversation_sweep_days, 3)  as "days",
                coalesce(conversation_sweep_time_utc, '02:30') as "timeUTC",
                conversation_sweep_last_at as "lastAt"
           from project_settings`
      );

      const now = new Date();
      const nowUTC = { h: now.getUTCHours(), m: now.getUTCMinutes() };

      for (const p of projs || []) {
        if (!p.enabled) continue;

        // only once a day around target time window (±3 minutes)
        const [hh, mm] = String(p.timeUTC || "02:30").split(":").map((x: string) => Number(x) || 0);
        const inWindow = (nowUTC.h === hh && Math.abs(nowUTC.m - mm) <= 3);
        if (!inWindow) continue;

        // skip if already run today
        const last = p.lastAt ? new Date(p.lastAt) : null;
        if (last && last.toISOString().slice(0, 10) === now.toISOString().slice(0, 10)) continue;

        // sweep empties older than N days
        const days = String(p.days);
        const { rows } = await db.execute(
          sql`select id from conversations
            where project_id=${p.projectId}
              and created_at < now() - (${days} || ' days')::interval
              and not exists (select 1 from conversation_messages m where m.conversation_id=conversations.id)
            limit 2000`
        );
        if (rows?.length) {
          const ids = rows.map((r: any) => r.id);
          await db.execute(sql`delete from conversations where id = any(${ids}::uuid[])`);
        }

        // stamp last run
        await db.execute(
          sql`insert into project_settings (project_id, conversation_sweep_last_at)
           values (${p.projectId}, now())
           on conflict (project_id) do update set conversation_sweep_last_at=now(), updated_at=now()`
        );
      }
      await beat("conversationSweep", true);
    } catch (e) {
      console.error("[conversationSweep] error", e);
      await beat("conversationSweep", false, String(e));
    }
  }, 5 * 60 * 1000);
}
