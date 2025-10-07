import { Router } from "express";
import { requireProject } from "../auth/projectAccess";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import multer from "multer";
import * as XLSX from "xlsx";

const upload = multer();

export const ma = Router();

ma.get("/playbooks", requireProject("member"), async (req, res) => {
  const pid = String(req.query.projectId||"");
  const { rows } = await db.execute(
    sql`select id, name, status, progress_pct as "progressPct" from playbooks where project_id=${pid} order by created_at desc`
  );
  res.json({ ok:true, items: rows||[] });
});

ma.post("/playbooks/instantiate", requireProject("admin"), async (req, res) => {
  const { projectId, templateId, name, params } = req.body || {};
  if (!projectId || !templateId || !name) return res.status(400).json({ error:"projectId, templateId, name required" });
  const { rows: t } = await db.execute(
    sql`select sections from playbook_templates where id=${templateId}`
  );
  const sections = (t?.[0] as any)?.sections || [];
  const out = sections;
  const { rows } = await db.execute(
    sql`insert into playbooks (project_id, template_id, name, params, sections) values (${projectId},${templateId},${name},${JSON.stringify(params||{})},${JSON.stringify(out)}) returning id`
  );
  res.json({ ok:true, id: (rows?.[0] as any)?.id });
});

ma.get("/integrations", requireProject("member"), async (req, res) => {
  const pid = String(req.query.projectId||"");
  const { rows } = await db.execute(
    sql`select id, project_id as "projectId", name, source_system as "sourceSystem", target_system as "targetSystem", status, depends_on as "dependsOn", last_test_result as "lastTestResult", created_at as "createdAt", updated_at as "updatedAt" from integrations where project_id=${pid} order by created_at desc`
  );
  res.json({ ok:true, items: rows||[] });
});

ma.post("/integrations", requireProject("member"), async (req, res) => {
  const { projectId, name, sourceSystem, targetSystem } = req.body || {};
  if (!projectId || !name || !sourceSystem || !targetSystem) {
    return res.status(400).json({ error: "projectId, name, sourceSystem, and targetSystem are required" });
  }
  const { rows } = await db.execute(
    sql`insert into integrations (project_id, name, source_system, target_system) values (${projectId},${name},${sourceSystem},${targetSystem}) returning id`
  );
  res.json({ ok:true, id: (rows?.[0] as any)?.id });
});

ma.get("/risks", requireProject("member"), async (req, res) => {
  const pid = String(req.query.projectId||"");
  const originType = String(req.query.originType || "");
  const where = [sql`project_id=${pid}`];
  if (originType && originType !== "all") {
    where.push(sql`origin_type=${originType}`);
  }
  const { rows } = await db.execute(
    sql`select * from risks where ${sql.join(where, sql` and `)} order by severity_score desc, created_at desc`
  );
  res.json({ ok:true, items: rows||[] });
});

ma.post("/risks", requireProject("member"), async (req, res) => {
  const { projectId, title, description, probability=50, impact=2, owner, mitigation, dueAt } = req.body || {};
  if (!projectId || !title) {
    return res.status(400).json({ error: "projectId and title are required" });
  }
  const severityScore = Math.round((probability/100) * impact * 10);
  
  const orgResult = await db.execute(sql`select org_id from projects where id = ${projectId}`);
  const orgId = (orgResult.rows?.[0] as any)?.org_id;
  
  const { rows } = await db.execute(
    sql`insert into risks (project_id, title, description, probability, impact, severity_score, owner, mitigation, due_at, org_id) 
    values (${projectId}, ${title}, ${description || null}, ${probability}, ${impact}, ${severityScore}, ${owner || null}, ${mitigation || null}, ${dueAt || null}, ${orgId})
    returning id`
  );
  res.json({ ok:true, id: (rows?.[0] as any)?.id });
});

ma.get("/stakeholders", requireProject("member"), async (req, res) => {
  const pid = String(req.query.projectId||"");
  const { rows } = await db.execute(
    sql`select * from stakeholders where project_id=${pid} order by role, name`
  );
  res.json({ ok:true, items: rows||[] });
});

ma.get("/stakeholders/suggest", requireProject("member"), async (req, res) => {
  const pid = String(req.query.projectId||"");
  const q   = String(req.query.q||"").trim().toLowerCase();
  const limit = Math.min(25, Math.max(1, Number(req.query.limit||"10")));
  const where = [`project_id=$1`];
  const params:any[]=[pid];
  if (q) {
    where.push(`(lower(name) like $${params.length+1} or lower(email) like $${params.length+1} or lower(org) like $${params.length+1} or lower(role) like $${params.length+1})`);
    params.push(`%${q}%`);
  }
  const { rows } = await db.execute(
    `select id, name, email, org, role from stakeholders where ${where.join(" and ")} order by name limit ${limit}`, params as any
  );
  res.json({ ok:true, items: rows||[] });
});

ma.post("/stakeholders", requireProject("member"), async (req, res) => {
  const { projectId, name, email, org, role, raci } = req.body || {};
  if (!projectId || !name) {
    return res.status(400).json({ error: "projectId and name are required" });
  }
  const { rows } = await db.execute(
    sql`insert into stakeholders (project_id, name, email, org, role, raci) values (${projectId},${name},${email},${org},${role},${raci}) returning id`
  );
  res.json({ ok:true, id: (rows?.[0] as any)?.id });
});

ma.post("/stakeholders/import", upload.single("file"), requireProject("member"), async (req,res)=>{
  try{
    const pid = String(req.query.projectId||"");
    if (!pid || !req.file) return res.status(400).json({ error:"projectId & file required" });
    const wb = XLSX.read(req.file.buffer, { type:"buffer" });
    let rows:number=0, ins=0, upd=0;

    for (const name of wb.SheetNames){
      const arr:any[] = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval:"" });
      for (const r of arr){
        rows++;
        const name = String(r["Name"]||r["Full Name"]||"").trim();
        const email= String(r["Email"]||"").trim().toLowerCase();
        const org  = String(r["Org"]||r["Organization"]||"").trim();
        const role = String(r["Role"]||"").trim();
        const raci = String(r["RACI"]||"").trim().toUpperCase().slice(0,1); // R|A|C|I

        if (!name && !email) continue;

        const f = await db.execute(
          sql`select id from stakeholders where project_id=${pid} and (email=${email||null} or (email is null and lower(name)=lower(${name}))) limit 1`
        );
        if (f.rows?.length){
          await db.execute(
            sql`update stakeholders set name=coalesce(${name||null},name), email=coalesce(${email||null},email), org=coalesce(${org||null},org), role=coalesce(${role||null},role), raci=coalesce(${raci||null},raci) where id=${(f.rows[0] as any).id}`
          ); upd++;
        } else {
          await db.execute(
            sql`insert into stakeholders (project_id, name, email, org, role, raci) values (${pid}, ${name}, ${email||null}, ${org||null}, ${role||null}, ${raci||null})`
          ); ins++;
        }
      }
    }
    res.json({ ok:true, rows, inserted:ins, updated:upd });
  }catch(e:any){ res.status(500).json({ error:String(e?.message||e) }); }
});

ma.get("/cadences", requireProject("member"), async (req, res) => {
  const pid = String(req.query.projectId||"");
  const { rows } = await db.execute(
    sql`select * from cadences where project_id=${pid} order by name`
  );
  res.json({ ok:true, items: rows||[] });
});

ma.post("/cadences", requireProject("admin"), async (req, res) => {
  const { projectId, name, frequency, dayOfWeek, timeUtc, attendees } = req.body || {};
  if (!projectId || !name) {
    return res.status(400).json({ error: "projectId and name are required" });
  }
  const { rows } = await db.execute(
    sql`insert into cadences (project_id, name, frequency, dow, time_utc, attendees) values (${projectId},${name},${frequency},${dayOfWeek},${timeUtc},${JSON.stringify(attendees||[])}) returning id`
  );
  res.json({ ok:true, id: (rows?.[0] as any)?.id });
});

ma.get("/lessons", requireProject("member"), async (req, res) => {
  const pid = String(req.query.projectId||"");
  const { rows } = await db.execute(
    sql`select * from lessons where project_id=${pid} order by created_at desc`
  );
  res.json({ ok:true, items: rows||[] });
});

ma.post("/lessons", requireProject("member"), async (req, res) => {
  const { projectId, title, category, whatHappened, recommendation, tags } = req.body || {};
  if (!projectId || !title) {
    return res.status(400).json({ error: "projectId and title are required" });
  }
  const { rows } = await db.execute(
    sql`insert into lessons (project_id, title, category, what_happened, recommendation, tags) values (${projectId},${title},${category},${whatHappened},${recommendation},${JSON.stringify(tags||[])}) returning id`
  );
  res.json({ ok:true, id: (rows?.[0] as any)?.id });
});

// Integrations summary - tiles + dependency edges
ma.get("/integrations/summary", requireProject("member"), async (req, res) => {
  const pid = String(req.query.projectId || "");
  const { rows: counts } = await db.execute(
    sql`select status, count(*)::int as n from integrations
     where project_id=${pid} group by status`
  );
  const { rows: items } = await db.execute(
    sql`select id, name, source_system as "sourceSystem",
            target_system as "targetSystem", depends_on as "dependsOn"
     from integrations where project_id=${pid}`
  );
  const edges = (items||[]).flatMap((it:any) =>
    (Array.isArray(it.dependsOn)?it.dependsOn:[]).map((to:string)=>({from: it.id, to})));
  res.json({ ok:true, counts, edges, items });
});

// Risks heatmap - 5x5 matrix
ma.get("/risks/heatmap", requireProject("member"), async (req, res) => {
  const pid = String(req.query.projectId || "");
  const { rows } = await db.execute(
    sql`select
       ceil(greatest(1, least(5, probability/20.0)))::int as pbin,
       greatest(1, least(5, impact))::int as ibin,
       count(*)::int as n
     from risks
     where project_id=${pid}
     group by pbin, ibin`
  );
  const mat = Array.from({length:5},()=>Array(5).fill(0));
  for (const r of rows as any[]) mat[r.pbin-1][r.ibin-1] = r.n;
  res.json({ ok:true, matrix: mat });
});

// Playbook → Actions binding
ma.post("/playbooks/bind-actions", requireProject("member"), async (req, res) => {
  const { projectId, playbookId, startDate } = req.body || {};
  if (!projectId || !playbookId) return res.status(400).json({ error:"projectId & playbookId required" });

  const { rows: pb } = await db.execute(
    sql`select sections from playbooks where id=${playbookId} and project_id=${projectId}`
  );
  if (!pb?.length) return res.status(404).json({ error:"playbook not found" });
  const sections = (pb[0] as any).sections || [];
  const base = startDate ? new Date(startDate) : new Date();

  let createdItems = 0, boundActions = 0;
  for (const sec of sections) {
    const list = sec.items || [];
    for (let i=0;i<list.length;i++) {
      const it = list[i] || {};
      const due = it.dueOffsetDays!=null ? new Date(base.getTime() + (it.dueOffsetDays*86400000)) : null;

      const { rows: exists } = await db.execute(
        sql`select id, action_id as "actionId" from playbook_items
         where project_id=${projectId} and playbook_id=${playbookId} and section=${sec.title || ""} and idx=${i} limit 1`
      );
      let itemId = (exists as any)?.[0]?.id;
      if (!itemId) {
        const { rows: ins } = await db.execute(
          sql`insert into playbook_items (project_id, playbook_id, section, idx, title, description, owner_role, due_at, tags)
           values (${projectId},${playbookId},${sec.title||""},${i},${it.title||""},${it.desc||""},${it.ownerRole||null},${due},${JSON.stringify(it.tags||[])}) returning id`
        );
        itemId = (ins as any)?.[0]?.id; createdItems++;
      }

      const already = (exists as any)?.[0]?.actionId;
      if (!already) {
        const { rows: act } = await db.execute(
          sql`insert into actions (project_id, artifact_id, title, owner, due_date, status, org_id)
           select ${projectId}, null, ${it.title||""}, null, ${due}, 'pending', org_id from projects where id=${projectId}
           returning id`
        );
        const actionId = (act as any)?.[0]?.id;
        await db.execute(sql`update playbook_items set action_id=${actionId} where id=${itemId}`);
        boundActions++;
      }
    }
  }
  res.json({ ok:true, createdItems, boundActions });
});

// Playbook items list
ma.get("/playbooks/:id/items", requireProject("member"), async (req,res)=>{
  const pid = String(req.query.projectId||"");
  const pbid = String(req.params.id||"");
  const { rows } = await db.execute(
    sql`select * from playbook_items where project_id=${pid} and playbook_id=${pbid} order by section, idx`
  );
  res.json({ ok:true, items: rows||[] });
});
