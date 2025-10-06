import { Router } from "express";
import { db } from "../db/client";
import { requireProject, getProjectIdFromReq } from "../auth/projectAccess";
import { sql } from "drizzle-orm";

export const issues = Router();

// GET /api/ma/issues?projectId=&integrationId=&status=&limit=20&offset=0
issues.get("/", requireProject("member"), async (req, res) => {
  const pid = String(req.query.projectId||"");
  const iid = String(req.query.integrationId||"");
  const st  = String(req.query.status||"");
  const limit = Math.min(100, Math.max(1, Number(req.query.limit||"20")));
  const offset= Math.max(0, Number(req.query.offset||"0"));

  const where:string[] = [`project_id = $1`]; const params:any[] = [pid];
  if (iid) { where.push(`integration_id = $${params.length+1}`); params.push(iid); }
  if (st)  { where.push(`status = $${params.length+1}`); params.push(st); }

  const sqlStr = `
    select id, integration_id as "integrationId", ref, status, priority, field, title, description, notes, created_at as "createdAt"
      from integration_issues
     where ${where.join(" and ")}
     order by created_at desc
     limit ${limit} offset ${offset}`;

  const { rows } = await db.execute(sqlStr as any, params);
  res.json({ ok:true, items: rows||[], meta:{ limit, offset } });
});

// POST /api/ma/issues (create)
issues.post("/", requireProject("member"), async (req, res) => {
  const { projectId, integrationId, ref, status="open", priority, field, title, description, notes } = req.body || {};
  if (!projectId || !title) return res.status(400).json({ error:"projectId & title required" });

  const { rows } = await db.execute(
    sql`insert into integration_issues (project_id, integration_id, ref, status, priority, field, title, description, notes)
     values (${projectId},${integrationId||null},${ref||null},${status},${priority||null},${field||null},${title},${description||null},${notes||null}) returning id`
  );
  res.json({ ok:true, id: rows?.[0]?.id });
});

// PATCH /api/ma/issues/:id (update any fields)
issues.patch("/:id", requireProject("member"), async (req, res) => {
  const id = String(req.params.id||"");
  const projectId = getProjectIdFromReq(req);
  if (!projectId) return res.status(400).json({ error: "projectId required" });
  
  const b  = req.body || {};
  const map:any = { ref:"ref", status:"status", priority:"priority", field:"field", title:"title", description:"description", notes:"notes", integrationId:"integration_id" };
  
  let query = sql`update integration_issues set updated_at = now()`;
  let hasUpdates = false;
  
  for (const [k,v] of Object.entries(b)) {
    const col = map[k]; if (!col) continue;
    query = sql`${query}, ${sql.raw(col)} = ${v}`;
    hasUpdates = true;
  }
  
  if (!hasUpdates) return res.json({ ok:true, noop:true });
  
  query = sql`${query} where id = ${id} and project_id = ${projectId}`;
  await db.execute(query);
  res.json({ ok:true });
});

// POST /api/ma/issues/:id/move  { status }
issues.post("/:id/move", requireProject("member"), async (req, res) => {
  const id = String(req.params.id||"");
  const projectId = getProjectIdFromReq(req);
  if (!projectId) return res.status(400).json({ error: "projectId required" });
  
  const status = String(req.body?.status||"");
  if (!status) return res.status(400).json({ error:"status required" });
  await db.execute(sql`update integration_issues set status=${status}, updated_at=now() where id=${id} and project_id=${projectId}`);
  res.json({ ok:true });
});

// DELETE /api/ma/issues/:id
issues.delete("/:id", requireProject("member"), async (req, res) => {
  const id = String(req.params.id||"");
  const projectId = getProjectIdFromReq(req);
  if (!projectId) return res.status(400).json({ error: "projectId required" });
  
  await db.execute(sql`delete from integration_issues where id=${id} and project_id=${projectId}`);
  res.json({ ok:true });
});

// CSV export: /api/ma/issues/export.csv?projectId=&integrationId=&status=
issues.get("/export.csv", requireProject("member"), async (req, res) => {
  const pid = String(req.query.projectId||"");
  const iid = String(req.query.integrationId||"");
  const st  = String(req.query.status||"");
  
  let query = sql`select i.id, i.ref, i.status, i.priority, i.field, i.title, i.description, i.notes,
            i.integration_id as "integrationId", coalesce(n.name,'') as "integrationName",
            i.created_at as "createdAt"
       from integration_issues i
  left join integrations n on n.id::text = i.integration_id
      where i.project_id = ${pid}`;
  
  if (iid) query = sql`${query} and i.integration_id = ${iid}`;
  if (st) query = sql`${query} and i.status = ${st}`;
  query = sql`${query} order by i.created_at desc limit 5000`;

  const { rows } = await db.execute(query);

  const esc = (s:any)=>`"${String(s??"").replace(/"/g,'""')}"`;
  const header = "id,ref,status,priority,field,title,description,notes,integrationId,integrationName,createdAt";
  const lines = rows.map((r:any)=>[
    r.id,r.ref||"",r.status||"",r.priority||"",r.field||"",r.title||"",r.description||"",r.notes||"",
    r.integrationId||"", r.integrationName||"", r.createdAt
  ].map(esc).join(","));
  res.setHeader("Content-Type","text/csv; charset=utf-8");
  res.setHeader("Content-Disposition",`attachment; filename="issues_${pid}.csv"`);
  res.send([header, ...lines].join("\r\n"));
});

// Artifacts: list/create/delete
issues.get("/:id/artifacts", requireProject("member"), async (req, res) => {
  const id = String(req.params.id||"");
  const { rows } = await db.execute(
    sql`select id, url, label, added_by as "addedBy", created_at as "createdAt"
       from issue_artifacts where issue_id=${id} order by created_at desc`
  );
  res.json({ ok:true, items: rows||[] });
});

issues.post("/:id/artifacts", requireProject("member"), async (req, res) => {
  const id = String(req.params.id||"");
  const { url, label, projectId } = req.body || {};
  if (!projectId || !url) return res.status(400).json({ error:"projectId & url required" });
  const userEmail = (req as any).user?.email || null;
  const { rows } = await db.execute(
    sql`insert into issue_artifacts (project_id, issue_id, url, label, added_by)
     values (${projectId},${id},${url},${label||null},${userEmail}) returning id`
  );
  res.json({ ok:true, id: rows?.[0]?.id });
});

issues.delete("/:id/artifacts/:artifactId", requireProject("member"), async (req, res) => {
  const aid = String(req.params.artifactId||"");
  await db.execute(sql`delete from issue_artifacts where id=${aid}`);
  res.json({ ok:true });
});
