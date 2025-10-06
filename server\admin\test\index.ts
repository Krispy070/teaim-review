import { Router } from "express";
import { seedMinimal } from "./seedMinimal";
import { db } from "../../db";
import { sql } from "drizzle-orm";

export const testAdminRouter = Router();

testAdminRouter.post("/seed-v2", async (req, res) => {
  const { projectId, userId } = req.body;
  if (!projectId) return res.status(400).json({ ok:false, error:"projectId required" });
  const stamp = new Date().toISOString();
  console.log("[TEST/SEED v2] start", { projectId, userId, stamp });

  try {
    const out = await seedMinimal(projectId, userId);
    const payload = { seeder:"v2", stamp, ...out };
    console.log("[TEST/SEED v2] done", payload);
    return res.json(payload);
  } catch (e:any) {
    console.error("[TEST/SEED v2] ERROR", e);
    return res.status(500).json({ seeder:"v2", ok:false, error: e?.message || String(e) });
  }
});

testAdminRouter.get("/debug", async (_req, res) => {
  try {
    const meta = await db.execute(sql`
      select current_database() as db,
             current_schema()   as schema,
             current_user       as user,
             version()          as pg_version
    `);

    const tables = await db.execute(sql`
      select table_schema, table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name in ('areas','workbooks','reports','changes','comments','releases','notifications','signoffs')
      order by table_name;
    `);

    const count = async (name: string) => {
      try {
        const r = await db.execute(sql`select count(*)::int as c from ${sql.identifier(name)}`);
        return r[0]?.c ?? 0;
      } catch { return -1; } // -1 means table missing or not visible
    };

    const counts = Object.fromEntries(
      await Promise.all(
        ['areas','workbooks','reports','changes','comments','releases','notifications','signoffs']
          .map(async t => [t, await count(t)])
      )
    );

    res.json({ ok:true, meta: meta[0], tables, counts });
  } catch (e:any) {
    res.status(500).json({ ok:false, error: e?.message || String(e) });
  }
});

// Keep existing endpoint for backward compatibility
testAdminRouter.post("/seed", async (req, res) => {
  const projectId = req.body?.projectId;
  if (!projectId) return res.status(400).json({ ok: false, error: "projectId required" });

  console.log("[TEST/SEED] starting seedMinimal v2 for project:", projectId);

  try {
    const out = await seedMinimal(projectId);
    console.log("[TEST/SEED] completed seedMinimal v2:", out);
    return res.json(out);
  } catch (e: any) {
    console.error("[TEST/SEED] ERROR:", e);
    return res.status(500).json({ ok: false, error: e.message ?? String(e) });
  }
});

// Bootstrap endpoint with robust DDL (improved version) 
testAdminRouter.post("/bootstrap-and-seed", async (req, res) => {
  const projectId = req.body?.projectId;
  if (!projectId) return res.status(400).json({ ok: false, error: "projectId required" });

  try {
    console.log("🔧 Bootstrap: Creating/updating database schema...");
    
    // Helper to safely add columns if they don't exist
    const addColumnIfNotExists = async (table: string, column: string, definition: string) => {
      try {
        await db.execute(sql.raw(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${definition}`));
      } catch (e: any) {
        // Ignore if column already exists - PostgreSQL handles this gracefully
        if (!e.message?.includes('already exists')) {
          console.warn(`Warning adding column ${table}.${column}:`, e.message);
        }
      }
    };

    // Create base tables first
    await db.execute(sql`
      -- Base table creation (idempotent)
      create table if not exists areas (
        id uuid primary key default gen_random_uuid(),
        project_id uuid not null,
        created_at timestamp default now()
      );
      
      create table if not exists workbooks (
        id uuid primary key default gen_random_uuid(),
        project_id uuid not null,
        created_at timestamp default now()
      );
      
      create table if not exists reports (
        id uuid primary key default gen_random_uuid(),
        project_id uuid not null,
        created_at timestamp default now()
      );
      
      create table if not exists changes (
        id uuid primary key default gen_random_uuid(),
        project_id uuid not null,
        created_at timestamp default now()
      );
      
      create table if not exists comments (
        id uuid primary key default gen_random_uuid(),
        project_id uuid not null,
        created_at timestamp default now()
      );
      
      create table if not exists releases (
        id uuid primary key default gen_random_uuid(),
        project_id uuid not null,
        created_at timestamp default now()
      );
      
      create table if not exists notifications (
        id uuid primary key default gen_random_uuid(),
        project_id uuid not null,
        created_at timestamp default now()
      );
      
      create table if not exists signoffs (
        token varchar(64) primary key,
        project_id uuid not null,
        created_at timestamp default now()
      );
      
      create table if not exists calendar_events (
        id uuid primary key default gen_random_uuid(),
        project_id uuid not null,
        user_id uuid not null,
        title text not null,
        start_date timestamp not null,
        end_date timestamp,
        description text,
        created_at timestamp default now()
      );
      
      create table if not exists artifacts (
        id uuid primary key default gen_random_uuid(),
        org_id uuid not null,
        project_id uuid not null,
        title text not null,
        path text not null,
        mime_type text not null,
        source text not null,
        created_at timestamp default now()
      );
    `);

    // Add missing columns to existing tables (including created_at for all tables)
    await addColumnIfNotExists('areas', 'created_at', 'timestamp default now()');
    await addColumnIfNotExists('areas', 'key', 'varchar(50) not null default \'DEF\'');
    await addColumnIfNotExists('areas', 'name', 'varchar(120) not null default \'Default Area\'');
    await addColumnIfNotExists('areas', 'status', 'varchar(24) not null default \'active\'');
    
    await addColumnIfNotExists('workbooks', 'created_at', 'timestamp default now()');
    await addColumnIfNotExists('workbooks', 'area_id', 'uuid');
    await addColumnIfNotExists('workbooks', 'title', 'varchar(200) not null default \'Default Workbook\'');
    await addColumnIfNotExists('workbooks', 'metrics', 'jsonb default \'{}\'::jsonb');
    
    await addColumnIfNotExists('reports', 'created_at', 'timestamp default now()');
    await addColumnIfNotExists('reports', 'area_id', 'uuid');
    await addColumnIfNotExists('reports', 'type', 'varchar(64) not null default \'default\'');
    await addColumnIfNotExists('reports', 'title', 'varchar(200) not null default \'Default Report\'');
    await addColumnIfNotExists('reports', 'payload', 'jsonb default \'{}\'::jsonb');
    
    await addColumnIfNotExists('changes', 'created_at', 'timestamp default now()');
    await addColumnIfNotExists('changes', 'area_id', 'uuid');
    await addColumnIfNotExists('changes', 'kind', 'varchar(24) not null default \'update\'');
    await addColumnIfNotExists('changes', 'summary', 'text not null default \'Default change\'');
    
    await addColumnIfNotExists('comments', 'created_at', 'timestamp default now()');
    await addColumnIfNotExists('comments', 'area_id', 'uuid');
    await addColumnIfNotExists('comments', 'body', 'text not null default \'Default comment\'');
    await addColumnIfNotExists('comments', 'author', 'varchar(120) not null default \'System\'');
    
    await addColumnIfNotExists('releases', 'created_at', 'timestamp default now()');
    await addColumnIfNotExists('releases', 'kind', 'varchar(24) not null default \'ics\'');
    await addColumnIfNotExists('releases', 'channel', 'varchar(24) not null default \'staging\'');
    await addColumnIfNotExists('releases', 'tag', 'varchar(80) not null default \'v1.0.0\'');
    
    await addColumnIfNotExists('notifications', 'created_at', 'timestamp default now()');
    await addColumnIfNotExists('notifications', 'org_id', 'uuid');
    await addColumnIfNotExists('notifications', 'user_id', 'uuid');
    await addColumnIfNotExists('notifications', 'title', 'text');
    await addColumnIfNotExists('notifications', 'kind', 'varchar(48) not null default \'system\'');
    await addColumnIfNotExists('notifications', 'seen', 'boolean not null default false');
    await addColumnIfNotExists('notifications', 'payload', 'jsonb default \'{}\'::jsonb');
    
    await addColumnIfNotExists('signoffs', 'created_at', 'timestamp default now()');
    await addColumnIfNotExists('signoffs', 'status', 'varchar(24) not null default \'issued\'');
    await addColumnIfNotExists('signoffs', 'expires_at', 'timestamp');
    
    await addColumnIfNotExists('artifacts', 'created_at', 'timestamp default now()');
    await addColumnIfNotExists('artifacts', 'meeting_date', 'text');
    await addColumnIfNotExists('artifacts', 'chunk_count', 'integer default 0');
    await addColumnIfNotExists('artifacts', 'area', 'text');

    // Create indexes
    await db.execute(sql`
      create index if not exists idx_areas_project on areas(project_id);
      create index if not exists idx_areas_key on areas(key);
      create index if not exists idx_workbooks_project on workbooks(project_id);
      create index if not exists idx_workbooks_area on workbooks(area_id);
      create index if not exists idx_reports_project on reports(project_id);
      create index if not exists idx_reports_area on reports(area_id);
      create index if not exists idx_reports_type on reports(type);
    `);

    console.log("✅ Bootstrap: Schema updated successfully");
    console.log("📊 Bootstrap: Running seed function...");
    
    const out = await seedMinimal(projectId);
    res.json({ ok: true, action: "bootstrap-and-seed", out });
  } catch (e: any) {
    console.error("❌ Bootstrap failed:", e);
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

testAdminRouter.get("/check-tables", async (req, res) => {
  try {
    const tables = ["areas", "workbooks", "reports", "changes", "comments", "releases", "notifications", "signoffs"];
    const results: Record<string, boolean> = {};
    
    for (const table of tables) {
      try {
        const result = await db.execute(sql.raw(`SELECT COUNT(*) as count FROM information_schema.tables WHERE table_name = '${table}'`));
        results[table] = Number(result[0]?.count ?? 0) > 0;
      } catch {
        results[table] = false;
      }
    }
    
    return res.json({ ok: true, tables: results });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});