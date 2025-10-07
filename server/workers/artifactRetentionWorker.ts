import fs from "node:fs";
import { db } from "../db/client";
import { sql } from "drizzle-orm";

/**
 * Every hour:
 *  - delete run artifacts & ticket attachments older than artifact_retention_days
 *  - enforce artifact_max_gb cap per project (oldest first)
 */
export function startArtifactRetentionWorker(){
  setInterval(async ()=>{
    try {
      const { rows: projs } = await db.execute(sql`select id from projects`);
      for (const p of projs || []){
        const pid = p.id as string;
        const result = await db.execute(
          sql`select artifact_retention_days as days, artifact_max_gb as gb from project_settings where project_id=${pid}`
        );
        const cfg = result.rows?.[0] || { days: 30, gb: 10 };

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

const ALLOWED_TABLES = ["integration_run_artifacts", "ticket_attachments"] as const;

async function purgeOld(table:string, projectId:string, days:number){
  // Strict allowlist validation to prevent SQL injection
  if (!ALLOWED_TABLES.includes(table as any)) {
    console.error(`[artifactRetention] Invalid table name: ${table}`);
    return;
  }
  
  // Validate days is a safe positive integer
  const safeDays = Math.floor(Number(days));
  if (!Number.isFinite(safeDays) || safeDays <= 0 || safeDays > 3650) {
    console.error(`[artifactRetention] Invalid days value: ${days}`);
    return;
  }
  
  // Use sql.identifier for table name and interval multiplication for safe date calculation
  const selectQuery = sql`select id, storage_path as "p" from ${sql.identifier(table)}
    where project_id=${projectId} and created_at < now() - interval '1 day' * ${safeDays}::int`;
  const { rows } = await db.execute(selectQuery);
  
  for (const r of rows||[]){
    if (r.p && typeof r.p === 'string' && fs.existsSync(r.p)) { 
      try { fs.unlinkSync(r.p); } catch {} 
    }
  }
  
  const deleteQuery = sql`delete from ${sql.identifier(table)} 
    where project_id=${projectId} and created_at < now() - interval '1 day' * ${safeDays}::int`;
  await db.execute(deleteQuery);
}

async function enforceCap(table:string, projectId:string, gb:number){
  // Strict allowlist validation to prevent SQL injection
  if (!ALLOWED_TABLES.includes(table as any)) {
    console.error(`[artifactRetention] Invalid table name: ${table}`);
    return;
  }
  
  // Validate gb is a safe positive number
  const safeGb = Number(gb);
  if (!Number.isFinite(safeGb) || safeGb <= 0) {
    console.error(`[artifactRetention] Invalid GB value: ${gb}`);
    return;
  }
  
  const capBytes = safeGb * 1024 * 1024 * 1024;
  
  // Use sql.identifier for table name and parameterized query for projectId
  const selectQuery = sql`select id, storage_path as "p", coalesce(size_bytes,0) as s
     from ${sql.identifier(table)} where project_id=${projectId} order by created_at asc`;
  const { rows } = await db.execute(selectQuery);
  
  let total = (rows||[]).reduce((a:number,r:any)=>a + Number(r.s||0), 0);
  for (const r of rows||[]){
    if (total <= capBytes) break;
    if (r.p && typeof r.p === 'string' && fs.existsSync(r.p)) { 
      try { fs.unlinkSync(r.p); } catch {} 
    }
    const id = r.id;
    const deleteQuery = sql`delete from ${sql.identifier(table)} where id=${id}`;
    await db.execute(deleteQuery);
    total -= Number(r.s||0);
  }
}
