import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { requireProject } from "../auth/projectAccess";

export const rimp = Router();
const upload = multer();

function detectModule(s:string){
  const x = (s||"").toLowerCase();
  if (/payroll/.test(x)) return "Payroll";
  if (/\b(absence|leave)\b/.test(x)) return "Absence";
  if (/\b(time|time\-tracking)\b/.test(x)) return "Time";
  if (/\bbenefit(s)?\b/.test(x)) return "Benefits";
  if (/\b(fin(ance)?|gl|ap|ar)\b/.test(x)) return "FIN";
  if (/\bsecurity|role(s)?\b/.test(x)) return "Security";
  if (/\bintegration(s)?|interface(s)?\b/.test(x)) return "Integrations";
  if (/\bhcm|core hr|workday platform\b/.test(x)) return "HCM";
  return "Custom";
}

rimp.get("/template.csv", (_req, res) => {
  const header = "Title,Module,Description,Status,Priority,Tags,PhaseTitle,PhaseId,OriginType,OriginId";
  res.type("text/csv").send(header + "\r\n");
});

rimp.post("/import", requireProject("member"), upload.single("file"), async (req, res) => {
  try {
    const { projectId } = req.body || {};
    const dryRun = String(req.body?.dryRun ?? "true").toLowerCase() !== "false";

    if (!projectId) return res.status(400).json({ error: "projectId required" });
    if (!req.file)   return res.status(400).json({ error: "file required" });

    const wb = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<any>(sheet, { defval: "" });

    const phaseByTitle = new Map<string,string>();
    const { rows: existingPhases } = await db.execute(
      sql`select id, title from roadmap_phases where project_id=${projectId}`
    );
    (existingPhases||[]).forEach((p:any)=> phaseByTitle.set((p.title||"").toLowerCase(), p.id));

    let previewCreated=0, previewPhases=0, errors:string[] = [];
    const previewPhasesSeen = new Set<string>();

    for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
      const r = rows[rowIdx];
      const title = String(r.Title||r["Roadmap Title"]||"").trim();
      if (!title) { 
        errors.push(`Row ${rowIdx+1}: Missing Title`); 
        continue; 
      }

      let module = String(r.Module||"").trim() || detectModule(title);
      const description = String(r.Description||"").trim() || null;
      const status = String(r.Status||"").trim().toLowerCase() || "planned";
      const priority = Number(r.Priority||50) || 50;
      const tags = String(r.Tags||"").split(/[;,]/).map((t:string)=>t.trim()).filter(Boolean);
      const originType = String(r.OriginType||"").trim().toLowerCase() || null;
      const originId   = String(r.OriginId||"").trim() || null;

      let phaseId = String(r.PhaseId||"").trim() || null;
      const phaseTitle = String(r.PhaseTitle||"").trim();

      if (!phaseId && phaseTitle) {
        const key = phaseTitle.toLowerCase();
        phaseId = phaseByTitle.get(key) || null;
        if (!phaseId) {
          if (!dryRun) {
            const max = await db.execute(
              sql`select coalesce(max(order_index),-1)+1 as o from roadmap_phases where project_id=${projectId}`
            );
            const ins = await db.execute(
              sql`insert into roadmap_phases (project_id, title, status, order_index) values (${projectId},${phaseTitle},'planned',${max.rows?.[0]?.o || 0}) returning id`
            );
            phaseId = (ins.rows?.[0]?.id as string) || null;
            if (phaseId) phaseByTitle.set(key, phaseId);
          } else {
            if (!previewPhasesSeen.has(key)) {
              previewPhases++;
              previewPhasesSeen.add(key);
            }
          }
        }
      }

      if (!dryRun) {
        const max = await db.execute(
          sql`select coalesce(max(order_index),-1)+1 as o from roadmap_items where project_id=${projectId} and phase_id is not distinct from ${phaseId}`
        );
        await db.execute(
          sql`insert into roadmap_items (project_id, phase_id, title, module, description, status, priority, tags, origin_type, origin_id, source, order_index)
           values (${projectId},${phaseId},${title},${module},${description},${status},${priority},${JSON.stringify(tags)},${originType},${originId},'import',${max.rows?.[0]?.o||0})`
        );
      }
      
      previewCreated++;
    }

    res.json({ ok:true, dryRun, preview:{ items: previewCreated, phasesCreated: previewPhases, errors } });
  } catch (e:any) {
    res.status(500).json({ error: String(e?.message||e) });
  }
});

export default rimp;
