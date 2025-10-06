import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { requireProject } from "../auth/projectAccess";
import { db } from "../db/client";

const upload = multer();
export const training = Router();

training.get("/plan", requireProject("member"), async (req, res) => {
  const pid = String(req.query.projectId||"");
  const { rows } = await db.execute(
    `select id, module, workstream, phase, topic, delivery, hours, audience, owner, status,
            start_at as "startAt", end_at as "endAt", location_url as "locationUrl",
            prereqs, resources_url as "resourcesUrl", notes
       from training_plan where project_id=$1
       order by coalesce(start_at, created_at) asc, module nulls last`, [pid] as any);
  res.json({ ok:true, items: rows||[] });
});

training.patch("/plan/:id", requireProject("member"), async (req, res) => {
  const id = String(req.params.id||"");
  const body = req.body||{};
  const cols:any = {
    module:"module", workstream:"workstream", phase:"phase", topic:"topic", delivery:"delivery",
    hours:"hours", audience:"audience", owner:"owner", status:"status",
    startAt:"start_at", endAt:"end_at", locationUrl:"location_url", prereqs:"prereqs",
    resourcesUrl:"resources_url", notes:"notes"
  };
  const sets:string[] = ["updated_at=now()"]; const params:any[] = [];
  for (const [k,v] of Object.entries(body)) {
    const col = cols[k]; if (!col) continue;
    params.push(v); sets.push(`${col}=$${params.length}`);
  }
  if (sets.length===1) return res.json({ ok:true, noop:true });
  params.push(id);
  await db.execute(`update training_plan set ${sets.join(", ")} where id=$${params.length}`, params as any);
  res.json({ ok:true });
});

function pick(v:any){ return (v==null || String(v).trim()==="") ? null : String(v).trim(); }
function num(v:any){ const n = Number(v); return Number.isFinite(n) ? n : null; }

training.post("/import", requireProject("member"), upload.single("file"), async (req, res) => {
  try{
    const pid = String(req.body?.projectId||"");
    if (!pid || !req.file) return res.status(400).json({ error:"projectId & file required" });

    const wb = XLSX.read(req.file.buffer, { type:"buffer" });
    let inserted = 0;

    const importCourseList = async (ws:XLSX.WorkSheet) => {
      const rows = XLSX.utils.sheet_to_json<any>(ws, { defval:"" });
      const promises = [];
      for (const r of rows){
        const topic = pick(r["Training Title"]); if (!topic) continue;
        const delivery = pick(r["Delivery Method/Training Type"]) || pick(r["Delivery Method"]) || null;
        const module = pick(r["Pillar"]) || null;
        const hours = num(r["Hours"]) ?? num(r["Days"])*8 ?? null;
        const notes = pick(r["Pricing (Total Pricing in $)"]) ? `Pricing: ${r["Pricing (Total Pricing in $)"]}` : null;

        promises.push(
          db.execute(
            `insert into training_plan (project_id, module, topic, delivery, hours, status, source_sheet, meta)
             values ($1,$2,$3,$4,$5,'planned',$6,$7)`,
            [pid, module, topic, delivery, hours, "Course List (original)", {}] as any
          )
        );
        inserted++;
      }
      await Promise.all(promises);
    };

    const importDataSheet = async (ws:XLSX.WorkSheet) => {
      const rows = XLSX.utils.sheet_to_json<any>(ws, { header:1, defval:"" }) as any[][];
      const promises = [];
      for (const row of rows){
        const topic = pick(row[1]); const delivery = pick(row[2]); const phase = pick(row[3]);
        const hours = num(row[4]);
        if (!topic || (!delivery && !phase && !hours)) continue;
        promises.push(
          db.execute(
            `insert into training_plan (project_id, topic, delivery, phase, hours, status, source_sheet, meta)
             values ($1,$2,$3,$4,$5,'planned',$6,$7)`,
            [pid, topic, delivery, phase, hours, "Data", { raw: row.slice(5) }] as any
          )
        );
        inserted++;
      }
      await Promise.all(promises);
    };

    if (wb.SheetNames.includes("Course List (original)")) await importCourseList(wb.Sheets["Course List (original)"]);
    if (wb.SheetNames.includes("Data")) await importDataSheet(wb.Sheets["Data"]);

    if (inserted===0) {
      for (const name of wb.SheetNames) {
        const ws = wb.Sheets[name];
        const rows = XLSX.utils.sheet_to_json<any>(ws, { defval:"" });
        if (rows.length && ("Training Title" in rows[0] || "topic" in rows[0])) {
          const promises = [];
          for (const r of rows){
            const topic = pick(r["Training Title"]||r["topic"]); if (!topic) continue;
            const module = pick(r["Pillar"]||r["module"]) || null;
            const delivery = pick(r["Delivery Method/Training Type"]||r["delivery"]) || null;
            const hours = num(r["Hours"]||r["hours"]) ?? null;
            promises.push(
              db.execute(
                `insert into training_plan (project_id, module, topic, delivery, hours, status, source_sheet)
                 values ($1,$2,$3,$4,$5,'planned',$6)`,
                [pid, module, topic, delivery, hours, name] as any
              )
            );
            inserted++;
          }
          await Promise.all(promises);
          break;
        }
      }
    }

    res.json({ ok:true, inserted });
  }catch(e:any){
    res.status(500).json({ error:String(e?.message||e) });
  }
});

training.get("/export.csv", requireProject("member"), async (req, res) => {
  const pid = String(req.query.projectId||"");
  const { rows } = await db.execute(
    `select module, workstream, phase, topic, delivery, hours, audience, owner, status,
            start_at as "startAt", end_at as "endAt", location_url as "locationUrl",
            prereqs, resources_url as "resourcesUrl", notes
       from training_plan where project_id=$1 order by module, phase, topic`, [pid] as any);
  const esc = (s:any)=>`"${String(s??"").replace(/"/g,'""')}"`;
  const header = "module,workstream,phase,topic,delivery,hours,audience,owner,status,startAt,endAt,locationUrl,prereqs,resourcesUrl,notes";
  const lines = rows.map((r:any)=>[
    r.module,r.workstream,r.phase,r.topic,r.delivery,r.hours,r.audience,r.owner,r.status,
    r.startAt||"",r.endAt||"",r.locationUrl||"",r.prereqs||"",r.resourcesUrl||"",r.notes||""
  ].map(esc).join(","));
  res.setHeader("Content-Type","text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="training_${pid}.csv"`);
  res.send([header, ...lines].join("\r\n"));
});

const pad = (n:number)=>String(n).padStart(2,"0");
const toUtc = (d:Date)=>`${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;

training.get("/plan.ics", requireProject("member"), async (req, res) => {
  const pid = String(req.query.projectId||"");
  const { rows } = await db.execute(
    `select id, topic, module, start_at as "startAt", end_at as "endAt", location_url as "locationUrl"
       from training_plan where project_id=$1 and start_at is not null order by start_at asc`, [pid] as any);
  const now = new Date();
  const lines = ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//TEAIM//Training//EN"];
  for (const r of rows) {
    const st = new Date(r.startAt); const en = r.endAt ? new Date(r.endAt) : new Date(st.getTime()+60*60*1000);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${r.id}@teaim.app`,
      `DTSTAMP:${toUtc(now)}`,
      `DTSTART:${toUtc(st)}`,
      `DTEND:${toUtc(en)}`,
      `SUMMARY:${(r.module?`[${r.module}] `:"")}${r.topic}`.replace(/\r?\n/g," "),
      r.locationUrl ? `URL:${r.locationUrl}` : "",
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  res.setHeader("Content-Type","text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="training_${pid}.ics"`);
  res.send(lines.join("\r\n"));
});
