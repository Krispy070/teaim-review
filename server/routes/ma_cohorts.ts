import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { requireProject } from "../auth/projectAccess";

export const ma = Router();
const upload = multer();

ma.get("/orgs", requireProject("member"), async (req, res) => {
  const pid = String(req.query.projectId || "");
  const rows = (await db.execute(
    sql`select id, name, brand, parent_id as "parentId", effective_start as "effectiveStart", effective_end as "effectiveEnd", created_at as "createdAt"
       from organizations where project_id=${pid} order by name`
  )).rows || [];
  res.json({ ok: true, items: rows });
});

ma.post("/orgs/upsert", requireProject("member"), async (req, res) => {
  const { projectId, id, name, brand, parentId, effectiveStart, effectiveEnd } = req.body || {};
  if (!projectId || (!id && !name)) return res.status(400).json({ error: "projectId & name (or id)" });
  if (id) {
    await db.execute(
      sql`update organizations set name=coalesce(${name}, name), brand=coalesce(${brand}, brand),
        parent_id=${parentId}, effective_start=${effectiveStart}, effective_end=${effectiveEnd} where id=${id} and project_id=${projectId}`
    );
  } else {
    await db.execute(
      sql`insert into organizations (project_id, name, brand, parent_id, effective_start, effective_end)
       values (${projectId}, ${name}, ${brand}, ${parentId}, ${effectiveStart}, ${effectiveEnd})`
    );
  }
  res.json({ ok: true });
});

ma.get("/cohorts", requireProject("member"), async (req, res) => {
  const pid = String(req.query.projectId || "");
  const owner = String(req.query.owner || "").trim().toLowerCase();
  const status = String(req.query.status || "").trim().toLowerCase();
  const q = String(req.query.q || "").trim().toLowerCase();
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || "30")));
  const offset = Math.max(0, Number(req.query.offset || "0"));

  const where: string[] = [`project_id=$1`];
  const params: any[] = [pid];

  if (owner) {
    where.push(`lower(coalesce(owner,'')) like $${params.length + 1}`);
    params.push(`%${owner}%`);
  }
  if (status) {
    where.push(`lower(status) = $${params.length + 1}`);
    params.push(status);
  }
  if (q) {
    where.push(`(lower(name) like $${params.length + 1} or lower(type) like $${params.length + 1} or lower(coalesce(description,'')) like $${params.length + 1})`);
    params.push(`%${q}%`);
  }

  // filtered rows
  const rows = (await db.execute(
    sql.raw(`select id, name, type, description, owner, status, created_at as "createdAt"
       from cohorts
      where ${where.join(" and ")}
      order by created_at desc
      limit ${limit} offset ${offset}`), params as any
  )).rows || [];

  // counts
  const filtered = (await db.execute(
    sql.raw(`select count(*)::int as n from cohorts where ${where.join(" and ")}`), params as any
  )).rows?.[0]?.n || 0;

  const total = (await db.execute(
    sql.raw(`select count(*)::int as n from cohorts where project_id=$1`), [pid] as any
  )).rows?.[0]?.n || 0;

  res.json({ ok: true, items: rows, meta: { limit, offset, filtered, total } });
});

ma.get("/cohorts/export.csv", requireProject("member"), async (req, res) => {
  const pid = String(req.query.projectId || "");
  const ownerFilter = String(req.query.owner || "");
  const statusFilter = String(req.query.status || "");
  const qFilter = String(req.query.q || "");
  
  let query = sql`select id, name, type, description, owner, status, created_at as "createdAt"
       from cohorts where project_id=${pid}`;
  
  if (ownerFilter) {
    query = sql`${query} and lower(owner) like lower(${'%' + ownerFilter + '%'})`;
  }
  if (statusFilter) {
    query = sql`${query} and status=${statusFilter}`;
  }
  if (qFilter) {
    query = sql`${query} and (lower(name) like lower(${'%' + qFilter + '%'}) or lower(description) like lower(${'%' + qFilter + '%'}))`;
  }
  
  query = sql`${query} order by created_at desc`;
  
  const rows = (await db.execute(query)).rows || [];
  
  // Convert to CSV
  const csvRows = [
    "ID,Name,Type,Description,Owner,Status,Created At"
  ];
  
  for (const r of rows) {
    const row = r as any;
    const escapeCsv = (v: any) => {
      const s = String(v || "");
      return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    csvRows.push([
      escapeCsv(row.id),
      escapeCsv(row.name),
      escapeCsv(row.type),
      escapeCsv(row.description),
      escapeCsv(row.owner),
      escapeCsv(row.status),
      escapeCsv(row.createdAt)
    ].join(","));
  }
  
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="cohorts-${new Date().toISOString().split('T')[0]}.csv"`);
  res.send(csvRows.join("\n"));
});

ma.post("/cohorts/create", requireProject("member"), async (req, res) => {
  const { projectId, name, type, description } = req.body || {};
  if (!projectId || !name || !type) return res.status(400).json({ error: "projectId, name, type" });
  const ins = await db.execute(
    sql`insert into cohorts (project_id, name, type, description) values (${projectId}, ${name}, ${type}, ${description}) returning id`
  );
  res.json({ ok: true, id: ins.rows?.[0]?.id });
});

ma.post("/cohorts/upsert", requireProject("member"), async (req, res) => {
  const { projectId, id, owner = null, status = null } = req.body || {};
  if (!projectId || !id) return res.status(400).json({ error: "projectId & id" });
  await db.execute(
    sql`update cohorts set owner=coalesce(${owner}, owner), status=coalesce(${status}, status) 
       where id=${id} and project_id=${projectId}`
  );
  res.json({ ok: true });
});

ma.post("/cohorts/:id/import", requireProject("member"), upload.single("file"), async (req, res) => {
  const cid = String(req.params.id || "");
  if (!cid || !req.file) return res.status(400).json({ error: "cohortId & file" });
  const wb = XLSX.read(req.file.buffer, { type: "buffer" });
  const sh = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json<any>(sh, { defval: "" });
  let created = 0;
  for (const r of data) {
    await db.execute(
      sql`insert into cohort_members (cohort_id, external_id, name, email, org_unit)
       values (${cid}, ${String(r.external_id || "")}, ${String(r.name || "")}, ${String(r.email || "")}, ${String(r.org_unit || "")})`
    );
    created++;
  }
  res.json({ ok: true, created });
});

ma.post("/separations/create", requireProject("member"), async (req, res) => {
  const { projectId, cohortId = null, title, type, scheduledAt = null } = req.body || {};
  if (!projectId || !title || !type) return res.status(400).json({ error: "projectId, title, type" });
  const ins = await db.execute(
    sql`insert into separation_events (project_id, cohort_id, title, type, scheduled_at) values (${projectId}, ${cohortId}, ${title}, ${type}, ${scheduledAt}) returning id`
  );
  res.json({ ok: true, id: ins.rows?.[0]?.id });
});

ma.post("/separations/:id/generate", requireProject("member"), async (req, res) => {
  const eid = String(req.params.id || "");
  const { projectId, pushToPlan = false } = req.body || {};
  if (!projectId || !eid) return res.status(400).json({ error: "projectId & eventId" });

  const tasks = [
    { title: "Identity cutover plan finalized", owner: null },
    { title: "Freeze data for impacted cohorts", owner: null },
    { title: "Integrations teardown scheduled", owner: "Integrations" },
    { title: "Security role updates applied", owner: "Security" },
    { title: "Legal/Compliance sign-off packet", owner: "Legal" },
  ];

  let created = 0, planLinked = 0, planId: string | null = null;
  for (const t of tasks) {
    await db.execute(
      sql`insert into separation_tasks (project_id, event_id, title, owner, status) values (${projectId}, ${eid}, ${t.title}, ${t.owner}, 'planned') returning id`
    );
    created++;
  }

  if (pushToPlan) {
    const plan = (await db.execute(
      sql`select id from project_plans where project_id=${projectId} and is_active=true order by created_at desc limit 1`
    )).rows?.[0] as any;
    if (plan) {
      planId = plan.id;
      const sts = (await db.execute(
        sql`select id, title, owner from separation_tasks where project_id=${projectId} and event_id=${eid}`
      )).rows || [];
      let order = 0;
      for (const s of sts) {
        await db.execute(
          sql`insert into plan_tasks (project_id, plan_id, title, owner, status, priority, source, origin_type, origin_id, order_index)
           values (${projectId}, ${planId}, ${(s as any).title}, ${(s as any).owner}, 'planned', 50, 'm&a', 'separation', ${(s as any).id}, ${order++})`
        );
        planLinked++;
      }
    }
  }

  res.json({ ok: true, created, planLinked, planId });
});

ma.get("/separations", requireProject("member"), async (req, res) => {
  const pid = String(req.query.projectId || "");
  const rows = (await db.execute(
    sql`select id, cohort_id as "cohortId", title, type, scheduled_at as "scheduledAt", status, created_at as "createdAt"
       from separation_events where project_id=${pid} order by created_at desc`
  )).rows || [];
  res.json({ ok: true, items: rows });
});

// POST /api/ma/cohorts/bulk { projectId, ids:[uuid], set:{ owner?, status? } }
ma.post("/cohorts/bulk", requireProject("member"), async (req,res)=>{
  const { projectId, ids=[], set={} } = req.body||{};
  if (!projectId || !Array.isArray(ids) || !ids.length) return res.status(400).json({ error:"projectId & ids" });
  const cols:string[]=[]; const params:any[]=[];
  if (set.owner   !== undefined){ cols.push(`owner=$${params.length+1}`);   params.push(set.owner||null); }
  if (set.status  !== undefined){ cols.push(`status=$${params.length+1}`);  params.push(set.status); }
  if (!cols.length) return res.json({ ok:true, updated:0 });
  params.push(ids);
  params.push(projectId);
  const r = await db.execute(
    `update cohorts set ${cols.join(", ")}, description=description
       where id = any($${params.length-1}::uuid[]) and project_id=$${params.length}`, params as any
  );
  res.json({ ok:true, updated: r.rowCount||0 });
});

// POST /api/ma/cohorts/bulk-by-filter { projectId, filter:{ ownerContains?, status?, q? }, set:{ owner?, status? } }
ma.post("/cohorts/bulk-by-filter", requireProject("member"), async (req,res)=>{
  const { projectId, filter={}, set={} } = req.body||{};
  if (!projectId) return res.status(400).json({ error:"projectId" });

  const sets:string[]=[]; const setParams:any[]=[];
  if (set.owner  !== undefined){ sets.push(`owner=$${setParams.length+1}`);  setParams.push(set.owner||null); }
  if (set.status !== undefined){ sets.push(`status=$${setParams.length+1}`); setParams.push(set.status); }
  if (!sets.length) return res.json({ ok:true, updated:0 });

  const whereParams:any[]=[projectId];
  const where:string[] = [`project_id=$${setParams.length+1}`];
  if (filter.ownerContains){
    where.push(`lower(coalesce(owner,'')) like $${setParams.length+whereParams.length+1}`);
    whereParams.push(`%${String(filter.ownerContains).toLowerCase()}%`);
  }
  if (filter.status){
    where.push(`status=$${setParams.length+whereParams.length+1}`);
    whereParams.push(filter.status);
  }
  if (filter.q){
    where.push(`(lower(name) like $${setParams.length+whereParams.length+1} or lower(type) like $${setParams.length+whereParams.length+1} or lower(coalesce(description,'')) like $${setParams.length+whereParams.length+1})`);
    whereParams.push(`%${String(filter.q).toLowerCase()}%`);
  }

  const r = await db.execute(
    `update cohorts set ${sets.join(", ")}, description=description where ${where.join(" and ")}`,
    [...setParams, ...whereParams] as any
  );
  res.json({ ok:true, updated: r.rowCount||0 });
});

export default ma;
