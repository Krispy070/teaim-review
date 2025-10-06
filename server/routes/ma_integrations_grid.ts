import { Router } from "express";
import multer from "multer";
import { requireProject } from "../auth/projectAccess";
import { db } from "../db/client";
import { sql } from "drizzle-orm";

const upload = multer();
export const maGrid = Router();

maGrid.get("/grid", requireProject("member"), async (req, res) => {
  const pid = String(req.query.projectId || "");
  if (!pid) return res.status(400).json({ error: "projectId required" });
  const { rows } = await db.execute(
    sql`select id, name, source_system as "sourceSystem", target_system as "targetSystem",
            status, owner, environment, test_status as "testStatus",
            cutover_start as "cutoverStart", cutover_end as "cutoverEnd",
            runbook_url as "runbookUrl", notes, depends_on as "dependsOn"
     from integrations where project_id=${pid} order by created_at asc`);
  res.json({ ok: true, items: rows || [] });
});

maGrid.patch("/:id", requireProject("member"), async (req, res) => {
  const id = String(req.params.id || "");
  const fields = req.body || {};
  const updateData: any = {};
  
  const colMap: Record<string, string> = {
    name:"name", sourceSystem:"source_system", targetSystem:"target_system",
    status:"status", owner:"owner", environment:"environment", testStatus:"test_status",
    cutoverStart:"cutover_start", cutoverEnd:"cutover_end", runbookUrl:"runbook_url",
    notes:"notes", dependsOn:"depends_on",
    adapterType:"adapter_type", adapterConfig:"adapter_config",
    scheduleCron:"schedule_cron", slaTarget:"sla_target", timezone:"timezone"
  };
  
  for (const [k,v] of Object.entries(fields)) {
    if (colMap[k]) updateData[colMap[k]] = v;
  }
  
  if (Object.keys(updateData).length===0) return res.json({ ok:true, noop:true });
  
  const setParts = Object.entries(updateData).map(([col, val]) => sql`${sql.identifier(col)}=${val}`);
  const query = sql`update integrations set ${sql.join(setParts, sql`, `)}, updated_at=now() where id=${id}`;
  
  await db.execute(query);
  res.json({ ok: true });
});

maGrid.get("/export.csv", requireProject("member"), async (req, res) => {
  const pid = String(req.query.projectId || "");
  if (!pid) return res.status(400).json({ error: "projectId required" });
  const { rows } = await db.execute(
    sql`select name, source_system as "sourceSystem", target_system as "targetSystem", status, owner,
            environment, test_status as "testStatus", cutover_start as "cutoverStart", cutover_end as "cutoverEnd",
            runbook_url as "runbookUrl", notes
     from integrations where project_id=${pid} order by created_at asc`);
  const header = "name,sourceSystem,targetSystem,status,owner,environment,testStatus,cutoverStart,cutoverEnd,runbookUrl,notes";
  const esc = (s:any)=>`"${String(s??"").replace(/"/g,'""')}"`;
  const lines = rows.map((r:any)=>[
    r.name, r.sourceSystem, r.targetSystem, r.status, r.owner, r.environment, r.testStatus,
    r.cutoverStart||"", r.cutoverEnd||"", r.runbookUrl||"", r.notes||""
  ].map(esc).join(","));
  res.setHeader("Content-Type","text/csv; charset=utf-8");
  res.setHeader("Content-Disposition","attachment; filename=integrations.csv");
  res.send([header, ...lines].join("\r\n"));
});

function parseCSV(text:string){
  const out: string[][] = [];
  let i=0, row:string[]=[], cell="", q=false;
  while(i<text.length){
    const c=text[i];
    if(q){
      if(c=='"' && text[i+1]=='"'){ cell+='"'; i+=2; continue; }
      if(c=='"'){ q=false; i++; continue; }
      cell+=c; i++; continue;
    }
    if(c=='"'){ q=true; i++; continue; }
    if(c==','){ row.push(cell); cell=""; i++; continue; }
    if(c=='\r'){ i++; continue; }
    if(c=='\n'){ row.push(cell); out.push(row); row=[]; cell=""; i++; continue; }
    cell+=c; i++;
  }
  row.push(cell); out.push(row);
  return out;
}

maGrid.post("/import", requireProject("member"), upload.single("file"), async (req, res) => {
  try{
    const pid = String(req.body?.projectId || "");
    if (!pid || !req.file) return res.status(400).json({ error:"projectId & file required" });
    const text = req.file.buffer.toString("utf8");
    const rows = parseCSV(text); if (!rows.length) return res.json({ ok:true, inserted:0, updated:0 });
    const header = rows[0].map(h=>h.trim().toLowerCase());
    const idx = (name:string)=> header.indexOf(name.toLowerCase());

    const map = {
      name: idx("name"), sourceSystem: idx("sourcesystem"), targetSystem: idx("targetsystem"),
      status: idx("status"), owner: idx("owner"), environment: idx("environment"),
      testStatus: idx("teststatus"), cutoverStart: idx("cutoverstart"), cutoverEnd: idx("cutoverend"),
      runbookUrl: idx("runbookurl"), notes: idx("notes"),
    } as Record<string, number>;

    let inserted=0, updated=0;
    for (let r=1; r<rows.length; r++){
      const row = rows[r]; if (!row.length) continue;
      const val = (k:string)=> map[k]>=0 ? row[map[k]] : "";
      const name = val("name"), src=val("sourceSystem"), tgt=val("targetSystem");
      if (!name && !(src && tgt)) continue;

      const { rows: found } = await db.execute(
        sql`select id from integrations where project_id=${pid} and (lower(name)=lower(${name}) or (lower(source_system)=lower(${src}) and lower(target_system)=lower(${tgt}))) limit 1`
      );

      if (found?.length){
        const id = found[0].id;
        const status = val("status"), owner = val("owner"), env = val("environment");
        const testSt = val("testStatus"), cutStart = val("cutoverStart"), cutEnd = val("cutoverEnd");
        const runUrl = val("runbookUrl"), notes = val("notes");
        
        await db.execute(
          sql`update integrations set
            name=coalesce(nullif(${name},''),name),
            source_system=coalesce(nullif(${src},''),source_system),
            target_system=coalesce(nullif(${tgt},''),target_system),
            status=coalesce(nullif(${status},''),status),
            owner=coalesce(nullif(${owner},''),owner),
            environment=coalesce(nullif(${env},''),environment),
            test_status=coalesce(nullif(${testSt},''),test_status),
            cutover_start=coalesce(nullif(${cutStart},''),cutover_start),
            cutover_end=coalesce(nullif(${cutEnd},''),cutover_end),
            runbook_url=coalesce(nullif(${runUrl},''),runbook_url),
            notes=coalesce(nullif(${notes},''),notes),
            updated_at=now()
           where id=${id}`
        );
        updated++;
      } else {
        const status = val("status") || "planned";
        const owner = val("owner") || null;
        const env = val("environment") || null;
        const testSt = val("testStatus") || null;
        const cutStart = val("cutoverStart") || null;
        const cutEnd = val("cutoverEnd") || null;
        const runUrl = val("runbookUrl") || null;
        const notes = val("notes") || null;
        const intName = name || `${src}→${tgt}`;
        
        await db.execute(
          sql`insert into integrations (project_id, name, source_system, target_system, status, owner, environment, test_status, cutover_start, cutover_end, runbook_url, notes)
           values (${pid},${intName},${src},${tgt},${status},${owner},${env},${testSt},${cutStart},${cutEnd},${runUrl},${notes})`
        );
        inserted++;
      }
    }

    res.json({ ok:true, inserted, updated });
  }catch(e:any){
    res.status(500).json({ error:String(e?.message||e) });
  }
});

maGrid.get("/:id", requireProject("member"), async (req, res) => {
  const id = String(req.params.id||"");
  const { rows: row } = await db.execute(
    sql`select id, project_id as "projectId", name, source_system as "sourceSystem",
            target_system as "targetSystem", status, owner, environment, test_status as "testStatus",
            cutover_start as "cutoverStart", cutover_end as "cutoverEnd",
            runbook_url as "runbookUrl", notes, depends_on as "dependsOn"
       from integrations where id=${id}`);
  if (!row?.length) return res.status(404).json({ ok:false, error:"not found" });
  const it = row[0];
  const { rows: rev } = await db.execute(
    sql`select id, name from integrations
      where project_id=${it.projectId} and depends_on @> ${JSON.stringify([it.id])}::jsonb`);
  const { rows: tests } = await db.execute(
    sql`select id, environment, status, executed_at as "executedAt", notes, link
       from integration_tests where integration_id=${id}
       order by executed_at desc limit 15`);
  res.json({ ok:true, item: it, reverseDeps: rev||[], tests: tests||[] });
});

maGrid.post("/:id/test-runs", requireProject("member"), async (req, res) => {
  const id = String(req.params.id||"");
  const { environment="test", status="in_progress", executedAt=null, notes=null, link=null } = req.body||{};
  const { rows: proj } = await db.execute(sql`select project_id as "projectId" from integrations where id=${id}`);
  if (!proj?.length) return res.status(404).json({ ok:false, error:"not found" });
  const projectId = proj[0].projectId;
  const { rows } = await db.execute(
    sql`insert into integration_tests (project_id, integration_id, environment, status, executed_at, notes, link)
     values (${projectId},${id},${environment},${status},coalesce(${executedAt}::timestamptz, now()),${notes},${link}) returning id`);
  res.json({ ok:true, id: rows?.[0]?.id });
});
