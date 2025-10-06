import fs from "node:fs";
import { db } from "../db/client";

/**
 * Every hour:
 *  - delete run artifacts & ticket attachments older than artifact_retention_days
 *  - enforce artifact_max_gb cap per project (oldest first)
 */
export function startArtifactRetentionWorker(){
  setInterval(async ()=>{
    try {
      const { rows: projs } = await db.execute(`select id from projects`, [] as any);
      for (const p of projs || []){
        const pid = p.id as string;
        const cfg = (await db.execute(
          `select artifact_retention_days as days, artifact_max_gb as gb from project_settings where project_id=$1`,
          [pid] as any
        )).rows?.[0] || { days: 30, gb: 10 };

        // Age-based purge
        await purgeOld("integration_run_artifacts", pid, cfg.days);
        await purgeOld("ticket_attachments", pid, cfg.days);

        // Cap-based purge
        await enforceCap("integration_run_artifacts", pid, cfg.gb);
        await enforceCap("ticket_attachments", pid, cfg.gb);
      }
    } catch (e) { console.error("[artifactRetention]", e); }
  }, 60 * 60 * 1000);
}

async function purgeOld(table:string, projectId:string, days:number){
  if (!days || days <= 0) return;
  const { rows } = await db.execute(
    `select id, storage_path as "p" from ${table}
      where project_id=$1 and created_at < now() - ($2 || ' days')::interval`, [projectId, String(days)] as any
  );
  for (const r of rows||[]){
    if (r.p && fs.existsSync(r.p)) { try { fs.unlinkSync(r.p); } catch {} }
  }
  await db.execute(`delete from ${table} where project_id=$1 and created_at < now() - ($2 || ' days')::interval`, [projectId, String(days)] as any);
}

async function enforceCap(table:string, projectId:string, gb:number){
  if (!gb || gb <= 0) return;
  const capBytes = gb * 1024 * 1024 * 1024;
  const { rows } = await db.execute(
    `select id, storage_path as "p", coalesce(size_bytes,0) as s
       from ${table} where project_id=$1 order by created_at asc`, [projectId] as any
  );
  let total = (rows||[]).reduce((a:number,r:any)=>a + Number(r.s||0), 0);
  for (const r of rows||[]){
    if (total <= capBytes) break;
    if (r.p && fs.existsSync(r.p)) { try { fs.unlinkSync(r.p); } catch {} }
    await db.execute(`delete from ${table} where id=$1`, [r.id] as any);
    total -= Number(r.s||0);
  }
}
