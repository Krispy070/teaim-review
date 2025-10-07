import { Router } from "express";
import { requireProject } from "../auth/projectAccess";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { insertTenantSchema, insertMigrationSchema, insertAsOfDateSchema } from "../../shared/schema";

export const tnt = Router();

/* Tenants CRUD lite */
tnt.get("/list", requireProject("member"), async (req,res)=>{
  const pid = String(req.query.projectId||"");
  const { rows } = await db.execute(
    sql`select id, name, vendor, environment, base_url as "baseUrl", wd_short as "workdayShortName", notes
       from tenants where project_id=${pid} order by environment, name`);
  res.json({ ok:true, items: rows||[] });
});

tnt.post("/upsert", requireProject("member"), async (req,res)=>{
  try {
    const { projectId, id, ...body } = req.body||{};
    if (!projectId) return res.status(400).json({ error: "projectId required" });
    
    const validated = insertTenantSchema.parse({ projectId, ...body });
    
    if (id) {
      await db.execute(
        sql`update tenants set name=${validated.name}, vendor=${validated.vendor||"Workday"}, 
         environment=${validated.environment||"prod"}, base_url=${validated.baseUrl||null}, 
         wd_short=${validated.workdayShortName||null}, notes=${validated.notes||null}, updated_at=now()
         where id=${id} and project_id=${projectId}`
      );
    } else {
      await db.execute(
        sql`insert into tenants (project_id, name, vendor, environment, base_url, wd_short, notes)
         values (${projectId},${validated.name},${validated.vendor||"Workday"},${validated.environment||"prod"},
         ${validated.baseUrl||null},${validated.workdayShortName||null},${validated.notes||null})`
      );
    }
    res.json({ ok:true });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Validation failed" });
  }
});

/* Migrations */
tnt.get("/migrations", requireProject("member"), async (req,res)=>{
  const pid = String(req.query.projectId||"");
  const { rows } = await db.execute(
    sql`select id, tenant_id as "tenantId", name, type, start_at as "startAt", end_at as "endAt", meta
       from migrations where project_id=${pid} order by start_at asc`);
  res.json({ ok:true, items: rows||[] });
});

tnt.post("/migrations/upsert", requireProject("member"), async (req,res)=>{
  try {
    const { projectId, id, ...body } = req.body||{};
    if (!projectId) return res.status(400).json({ error: "projectId required" });
    
    const validated = insertMigrationSchema.parse({ projectId, ...body });
    
    if (id) {
      await db.execute(
        sql`update migrations set tenant_id=${validated.tenantId||null}, name=${validated.name}, 
         type=${validated.type||"window"}, start_at=${validated.startAt||null}, 
         end_at=${validated.endAt||null}, meta=${validated.meta||{}}
         where id=${id} and project_id=${projectId}`
      );
    } else {
      await db.execute(
        sql`insert into migrations (project_id, tenant_id, name, type, start_at, end_at, meta)
         values (${projectId},${validated.tenantId||null},${validated.name},${validated.type||"window"},
         ${validated.startAt||null},${validated.endAt||null},${validated.meta||{}})`
      );
    }
    res.json({ ok:true });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Validation failed" });
  }
});

/* Data As-Of dates */
tnt.get("/asof", requireProject("member"), async (req,res)=>{
  const pid = String(req.query.projectId||"");
  const { rows } = await db.execute(
    sql`select id, tenant_id as "tenantId", domain, asof as "asOf", note
       from asof_dates where project_id=${pid} order by asof desc`);
  res.json({ ok:true, items: rows||[] });
});

tnt.post("/asof/upsert", requireProject("member"), async (req,res)=>{
  try {
    const { projectId, id, ...body } = req.body||{};
    if (!projectId) return res.status(400).json({ error: "projectId required" });
    
    const validated = insertAsOfDateSchema.parse({ projectId, ...body });
    
    if (id) {
      await db.execute(
        sql`update asof_dates set tenant_id=${validated.tenantId||null}, domain=${validated.domain}, 
         asof=${validated.asOf}, note=${validated.note||null}
         where id=${id} and project_id=${projectId}`
      );
    } else {
      await db.execute(
        sql`insert into asof_dates (project_id, tenant_id, domain, asof, note)
         values (${projectId},${validated.tenantId||null},${validated.domain},${validated.asOf},${validated.note||null})`
      );
    }
    res.json({ ok:true });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Validation failed" });
  }
});

/* ICS for migrations */
const pad = (n:number)=>String(n).padStart(2,"0");
const toUtc = (d:Date)=>`${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;

tnt.get("/migrations.ics", requireProject("member"), async (req,res)=>{
  const pid = String(req.query.projectId||"");
  const { rows } = await db.execute(
    sql`select id, name, type, start_at as "startAt", end_at as "endAt" from migrations
     where project_id=${pid} order by start_at asc`);
  const now = new Date();
  const ics = ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//TEAIM//Migrations//EN"];
  for (const m of rows as any[]) {
    if (!m.startAt) continue;
    const st = new Date(m.startAt as string);
    const en = m.endAt ? new Date(m.endAt as string) : new Date(st.getTime()+60*60*1000);
    ics.push("BEGIN:VEVENT", `UID:${m.id}@teaim.app`, `DTSTAMP:${toUtc(now)}`, `DTSTART:${toUtc(st)}`, `DTEND:${toUtc(en)}`,
             `SUMMARY:${String(m.type).toUpperCase()}: ${m.name}`, "END:VEVENT");
  }
  ics.push("END:VCALENDAR");
  res.type("text/calendar").send(ics.join("\r\n"));
});
