import { Router } from "express";
import { requireProject } from "../auth/projectAccess";
import { db } from "../db/client";
import { sql } from "drizzle-orm";

const pad = (n:number)=>String(n).padStart(2,"0");
const toUtc = (d:Date)=>`${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;

export const cadApi = Router();

cadApi.get("/ics", requireProject("member"), async (req, res) => {
  const pid = String(req.query.projectId||"");
  if (!pid) return res.status(400).json({ error: "projectId required" });
  const { rows } = await db.execute(
    sql`select id, name, frequency, dow as "dayOfWeek", time_utc as "timeUtc"
     from cadences where project_id=${pid}`);
  const now = new Date();
  const weeks = 12;
  const lines = ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//TEAIM//Cadences//EN"];
  for (const c of rows) {
    for (let w=0; w<weeks; w++){
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
      const targetDow = Number(c.dayOfWeek||3);
      const delta = (7 + targetDow - d.getUTCDay()) % 7;
      d.setUTCDate(d.getUTCDate() + delta + (w * (c.frequency==="biweekly" ? 14 : c.frequency==="monthly" ? 30 : 7)));
      const [hh,mm] = String(c.timeUtc||"17:00").split(":").map(Number);
      d.setUTCHours(hh||17, mm||0, 0, 0);
      const start = toUtc(d);
      lines.push(
        "BEGIN:VEVENT",
        `UID:${c.id}-${w}@teaim.app`,
        `DTSTAMP:${toUtc(now)}`,
        `DTSTART:${start}`,
        `SUMMARY:${(c.name||"Cadence").replace(/\r?\n/g," ")}`,
        "END:VEVENT"
      );
    }
  }
  lines.push("END:VCALENDAR");
  res.setHeader("Content-Type","text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition",`attachment; filename="cadences_${pid}.ics"`);
  res.send(lines.join("\r\n"));
});

cadApi.get("/upcoming", requireProject("member"), async (req, res) => {
  const pid = String(req.query.projectId||"");
  if (!pid) return res.status(400).json({ error: "projectId required" });
  const { rows } = await db.execute(
    sql`select id, name, frequency, dow as "dayOfWeek", time_utc as "timeUtc" from cadences where project_id=${pid}`);
  const now = new Date();
  const nexts:any[] = [];
  for (const c of rows) {
    for (let w=0; w<6; w++){
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
      const targetDow = Number(c.dayOfWeek||3);
      const delta = (7 + targetDow - d.getUTCDay()) % 7;
      d.setUTCDate(d.getUTCDate() + delta + (w * (c.frequency==="biweekly" ? 14 : c.frequency==="monthly" ? 30 : 7)));
      const [hh,mm] = String(c.timeUtc||"17:00").split(":").map(Number);
      d.setUTCHours(hh||17, mm||0, 0, 0);
      nexts.push({ id:c.id, name:c.name, at:d.toISOString() });
    }
  }
  nexts.sort((a,b)=> new Date(a.at).getTime() - new Date(b.at).getTime());
  res.json({ ok:true, items: nexts.slice(0,10) });
});
