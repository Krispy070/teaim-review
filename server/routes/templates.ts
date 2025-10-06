import { Router } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { requireProject } from "../auth/projectAccess";
import fs from "node:fs";
import path from "node:path";

export const tlib = Router();

/* ---------- Template library ---------- */
// GET /api/templates/list?projectId=&scope=partner|project
tlib.get("/list", requireProject("member"), async (req, res) => {
  const pid = String(req.query.projectId || "");
  const sc = String(req.query.scope || "project");
  
  let rows;
  if (sc === "partner") {
    rows = (await db.execute(
      sql`select id, scope, project_id as "projectId", name, category, mime, vars, created_at as "createdAt"
          from templates where scope='partner' order by created_at desc`
    )).rows || [];
  } else {
    rows = (await db.execute(
      sql`select id, scope, project_id as "projectId", name, category, mime, vars, created_at as "createdAt"
          from templates where scope='project' and project_id=${pid} order by created_at desc`
    )).rows || [];
  }
  res.json({ ok: true, items: rows });
});

// POST /api/templates/upsert  { projectId?, scope, id?, name, category, mime?, body, vars?[] }
tlib.post("/upsert", requireProject("member"), async (req, res) => {
  const b = req.body || {};
  if (!b.scope || (!b.id && !b.name) || !b.category || !b.body) {
    return res.status(400).json({ error: "scope,name,category,body" });
  }
  
  if (b.id) {
    await db.execute(
      sql`update templates set name=coalesce(${b.name}, name), category=coalesce(${b.category}, category), 
          mime=coalesce(${b.mime}, mime), body=coalesce(${b.body}, body), vars=coalesce(${JSON.stringify(b.vars || null)}, vars)
          where id=${b.id}`
    );
  } else {
    await db.execute(
      sql`insert into templates (scope, project_id, name, category, mime, body, vars)
          values (${b.scope}, ${b.projectId || null}, ${b.name}, ${b.category}, ${b.mime || "text/html"}, ${b.body}, ${JSON.stringify(b.vars || [])})`
    );
  }
  res.json({ ok: true });
});

/* ---------- Generate instance ---------- */
// POST /api/templates/instantiate  { projectId, templateId, name, filled:{...} }
tlib.post("/instantiate", requireProject("member"), async (req, res) => {
  const { projectId, templateId, name, filled = {} } = req.body || {};
  if (!projectId || !templateId || !name) {
    return res.status(400).json({ error: "projectId, templateId, name" });
  }

  const tpl = (await db.execute(
    sql`select category, mime, body from templates where id=${templateId}`
  )).rows?.[0] as any;
  
  if (!tpl) return res.status(404).json({ error: "template not found" });

  // naive renderer: ${VAR} replacement
  let out = String(tpl.body || "");
  for (const [k, v] of Object.entries(filled || {})) {
    out = out.replace(new RegExp(`\\$\\{${escapeReg(k)}\\}`, 'g'), String(v));
  }
  function escapeReg(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  // write to /tmp
  const fname = `tpl_${Date.now()}_${Math.random().toString(36).slice(2)}.html`;
  const fpath = path.join("/tmp", fname);
  fs.writeFileSync(fpath, out);

  const ins = await db.execute(
    sql`insert into template_instances (template_id, project_id, name, filled, rendered_path, category, status)
        values (${templateId}, ${projectId}, ${name}, ${JSON.stringify(filled)}, ${fpath}, ${tpl.category}, 'draft') returning id`
  );
  res.json({ ok: true, id: ins.rows?.[0]?.id, path: fpath });
});

/* ---------- Create approval ticket from instance ---------- */
// POST /api/templates/:id/ticket  { projectId, title?, description? }
tlib.post("/:id/ticket", requireProject("member"), async (req, res) => {
  const id = String(req.params.id || "");
  const { projectId, title, description } = req.body || {};
  if (!projectId) return res.status(400).json({ error: "projectId" });

  const inst = (await db.execute(
    sql`select name, category from template_instances where id=${id}`
  )).rows?.[0] as any;
  
  if (!inst) return res.status(404).json({ error: "instance not found" });

  const t = await db.execute(
    sql`insert into tickets (project_id, source, source_id, title, description, status, priority)
        values (${projectId}, 'template_instance', ${id}, ${title || `[${inst.category}] ${inst.name}`}, ${description || ""}, 'triage', 'med') returning id`
  );
  
  await db.execute(
    sql`update template_instances set ticket_id=${t.rows?.[0]?.id}, status='submitted' where id=${id}`
  );
  
  res.json({ ok: true, ticketId: t.rows?.[0]?.id });
});

/* ---------- Approve / reject ---------- */
// POST /api/templates/:id/approve  { projectId }
tlib.post("/:id/approve", requireProject("member"), async (req, res) => {
  const id = String(req.params.id || "");
  const { projectId } = req.body || {};
  if (!projectId) return res.status(400).json({ error: "projectId" });
  
  await db.execute(sql`update template_instances set status='approved' where id=${id}`);
  res.json({ ok: true });
});

// POST /api/templates/:id/reject  { projectId }
tlib.post("/:id/reject", requireProject("member"), async (req, res) => {
  const id = String(req.params.id || "");
  const { projectId } = req.body || {};
  if (!projectId) return res.status(400).json({ error: "projectId" });
  
  await db.execute(sql`update template_instances set status='rejected' where id=${id}`);
  res.json({ ok: true });
});

export default tlib;
