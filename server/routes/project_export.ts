import { Router } from "express";
import archiver from "archiver";
import { requireProject } from "../auth/projectAccess";
import { db } from "../db/client";
import { sql } from "drizzle-orm";

export const pexport = Router();

function esc(s:any){ return `"${String(s??"").replace(/"/g,'""')}"`; }

pexport.get("/export.zip", requireProject("member"), async (req, res, next) => {
  try{
    const pid = String(req.query.projectId||"");
    if (!pid) return res.status(400).json({ error:"projectId required" });

    res.setHeader("Content-Type","application/zip");
    res.setHeader("Content-Disposition",`attachment; filename="teaim_project_${pid}.zip"`);

    const arc = archiver("zip");
    arc.on("error", next);
    arc.pipe(res);

    async function csv(name:string, header:string[], rows:any[]){
      const lines = [header.join(",")];
      for (const r of rows) lines.push(header.map(h=>esc(r[h])).join(","));
      arc.append(lines.join("\r\n"), { name: `csv/${name}.csv` });
    }

    {
      const { rows } = await db.execute(
        sql`select id, name, mime, size_bytes as "sizeBytes", has_pii as "hasPii", created_at as "createdAt"
           from docs where project_id=${pid} and deleted_at is null order by created_at asc`);
      await csv("docs", ["id","name","mime","sizeBytes","hasPii","createdAt"], rows);
    }

    {
      const { rows } = await db.execute(
        sql`select id, title, assignee, due_at as "dueAt", priority, status, source, doc_id as "docId", created_at as "createdAt"
           from actions where project_id=${pid} order by created_at asc`);
      await csv("actions", ["id","title","assignee","dueAt","priority","status","source","docId","createdAt"], rows);
    }

    {
      const { rows } = await db.execute(
        sql`select id, title, type, starts_at as "startsAt", ends_at as "endsAt", confidence, doc_id as "docId"
           from timeline_events where project_id=${pid} order by coalesce(starts_at, created_at) asc`);
      await csv("timeline_events", ["id","title","type","startsAt","endsAt","confidence","docId"], rows);
    }

    {
      const { rows } = await db.execute(
        sql`select id, name, source_system as "sourceSystem", target_system as "targetSystem", status, owner, environment, test_status as "testStatus",
                cutover_start as "cutoverStart", cutover_end as "cutoverEnd", runbook_url as "runbookUrl", notes, depends_on as "dependsOn"
           from integrations where project_id=${pid} order by created_at asc`);
      await csv("integrations", ["id","name","sourceSystem","targetSystem","status","owner","environment","testStatus","cutoverStart","cutoverEnd","runbookUrl","notes","dependsOn"], rows);
    }

    {
      const { rows } = await db.execute(
        sql`select id, title, description, probability, impact, severity, owner, status, due_at as "dueAt", tags
           from risks where project_id=${pid} order by severity desc, created_at desc`);
      await csv("risks", ["id","title","description","probability","impact","severity","owner","status","dueAt","tags"], rows);
    }

    {
      const { rows } = await db.execute(
        sql`select id, name, email, org, role, raci from stakeholders where project_id=${pid} order by role, name`);
      await csv("stakeholders", ["id","name","email","org","role","raci"], rows);
    }

    {
      const { rows } = await db.execute(
        sql`select id, title, category, what_happened as "whatHappened", recommendation, tags from lessons where project_id=${pid} order by created_at desc`);
      await csv("lessons", ["id","title","category","whatHappened","recommendation","tags"], rows);
    }

    {
      const { rows } = await db.execute(
        sql`select id, module, workstream, phase, topic, delivery, hours, audience, owner, status,
                start_at as "startAt", end_at as "endAt", location_url as "locationUrl", prereqs, resources_url as "resourcesUrl", notes
           from training_plan where project_id=${pid} order by coalesce(start_at, created_at) asc`);
      await csv("training_plan", ["id","module","workstream","phase","topic","delivery","hours","audience","owner","status","startAt","endAt","locationUrl","prereqs","resourcesUrl","notes"], rows);
    }

    {
      const pad = (n:number)=>String(n).padStart(2,"0");
      const toUtc = (d:Date)=>`${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
      const now = new Date();

      const { rows: rels } = await db.execute(
        sql`select id, title, description, starts_at as "startsAt" from releases where project_id=${pid} order by starts_at asc`);
      let ics = ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//TEAIM//Project//EN"];
      for (const r of rels) {
        const st = new Date(r.startsAt);
        ics.push("BEGIN:VEVENT", `UID:${r.id}@teaim.app`, `DTSTAMP:${toUtc(now)}`, `DTSTART:${toUtc(st)}`, `SUMMARY:${String(r.title).replace(/\r?\n/g," ")}`, "END:VEVENT");
      }
      ics.push("END:VCALENDAR");
      arc.append(ics.join("\r\n"), { name: "ics/releases.ics" });
    }

    await arc.finalize();
  }catch(e){ next(e); }
});
