import { Router } from "express";
import { db } from "../db/client";
import { requireProject } from "../auth/projectAccess";
import { asyncHandler } from "../middleware/errorHandler";
import { exec } from "../db/exec";
import { clampInt } from "../lib/validate";
import { csvSafe, setDownloadHeaders } from "../lib/csv";
import { sql } from "drizzle-orm";

export const tix = Router();

// GET /api/tickets?projectId=&status=&q=&priority=&assignee=&limit=30&offset=0
tix.get("/", requireProject("member"), asyncHandler(async (req, res) => {
  const pid = String(req.query.projectId || "");
  const st  = String(req.query.status || "");
  const pr  = String(req.query.priority || "");
  const asg = String(req.query.assignee || "");
  const q   = String(req.query.q || "").toLowerCase();

  const limit = clampInt(req.query.limit, 1, 100, 30);
  const offset= Math.max(0, Number(req.query.offset||"0")|0);

  const where:string[] = [`project_id=$1`]; const params:any=[pid];
  if (st)  { where.push(`status=$${params.length+1}`);   params.push(st); }
  if (pr)  { where.push(`priority=$${params.length+1}`); params.push(pr); }
  if (asg) { where.push(`assignee ilike $${params.length+1}`); params.push(`%${asg}%`); }
  if (q)   { where.push(`(lower(title) like $${params.length+1} or lower(description) like $${params.length+1})`); params.push(`%${q}%`); }

  const items = (await exec(
    `select id, source, source_id as "sourceId", title, status, priority, assignee,
            external_system as "externalSystem", external_key as "externalKey", external_url as "externalUrl", created_at as "createdAt"
       from tickets
      where ${where.join(" and ")}
      order by created_at desc
      limit ${limit} offset ${offset}`,
    params,
    12_000,
    "tickets:list"
  )).rows;

  const filtered = (await exec(
    `select count(*)::int as n from tickets where ${where.join(" and ")}`,
    params, 12_000, "tickets:count"
  )).rows?.[0]?.n || 0;

  const total = (await exec(
    `select count(*)::int as n from tickets where project_id=$1`,
    [pid], 12_000, "tickets:total"
  )).rows?.[0]?.n || 0;

  res.json({ ok:true, items, meta:{ limit, offset, filtered, total } });
}));

tix.post("/", requireProject("member"), async (req, res) => {
  const { projectId, ...b } = req.body || {};
  
  if (b.id) {
    // Update: build SET clauses only for provided fields
    const setClauses: string[] = ["updated_at = now()"];
    const params: any[] = [];
    const fieldMap: Record<string, string> = {
      title: "title",
      description: "description",
      status: "status",
      priority: "priority",
      assignee: "assignee",
      externalSystem: "external_system",
      externalKey: "external_key",
      externalUrl: "external_url",
      slaTarget: "sla_target"
    };
    
    for (const [clientKey, dbCol] of Object.entries(fieldMap)) {
      if (clientKey in b) {
        params.push(b[clientKey]);
        setClauses.push(`${dbCol} = $${params.length}`);
      }
    }
    if ("meta" in b) {
      params.push(JSON.stringify(b.meta || {}));
      setClauses.push(`meta = $${params.length}`);
    }
    
    if (setClauses.length === 1) return res.status(400).json({ error: "No fields to update" });
    
    params.push(b.id, projectId);
    await exec(
      `update tickets set ${setClauses.join(", ")} where id = $${params.length - 1} and project_id = $${params.length}`,
      params, 12_000, "tickets:update"
    );
    return res.json({ ok: true, id: b.id });
  } else {
    // Insert: require title
    if (!projectId || !b.title) return res.status(400).json({ error: "projectId & title required" });
    const ins = await db.execute(
      sql`insert into tickets (project_id, source, source_id, title, description, status, priority, assignee, external_system, external_key, external_url, sla_target, meta)
       values (${projectId}, ${b.source || "manual"}, ${b.sourceId || null}, ${b.title}, ${b.description || null}, ${b.status || "new"}, ${b.priority || "med"}, ${b.assignee || null},
       ${b.externalSystem || null}, ${b.externalKey || null}, ${b.externalUrl || null}, ${b.slaTarget || null}, ${JSON.stringify(b.meta || {})}) returning id`
    );
    return res.json({ ok: true, id: ins.rows?.[0]?.id });
  }
});

tix.get("/:id/comments", requireProject("member"), async (req, res) => {
  const id = String(req.params.id || "");
  const { rows } = await db.execute(
    sql`select id, author, body, created_at as "createdAt" from ticket_comments where ticket_id = ${id} order by created_at asc`
  );
  res.json({ ok: true, items: rows || [] });
});

tix.post("/:id/comments", requireProject("member"), async (req, res) => {
  const id = String(req.params.id || "");
  const { projectId, body } = req.body || {};
  const author = (req as any).user?.email || null;
  await db.execute(
    sql`insert into ticket_comments (project_id, ticket_id, author, body) values (${projectId}, ${id}, ${author}, ${body || ""})`
  );
  res.json({ ok: true });
});

tix.get("/export.csv", requireProject("member"), async (req, res) => {
  const pid = String(req.query.projectId || "");
  const { rows } = await db.execute(
    sql`select id, title, status, priority, assignee, source, source_id as "sourceId", external_system as "externalSystem",
            external_key as "externalKey", external_url as "externalUrl", created_at as "createdAt"
       from tickets where project_id = ${pid} order by created_at desc`
  );
  setDownloadHeaders(res, `tickets-${pid}.csv`);
  const header = "id,title,status,priority,assignee,source,sourceId,externalSystem,externalKey,externalUrl,createdAt";
  const lines = rows.map((r: any) => [r.id, r.title, r.status, r.priority, r.assignee || "", r.source || "", r.sourceId || "", r.externalSystem || "", r.externalKey || "", r.externalUrl || "", r.createdAt].map(csvSafe).join(","));
  res.send([header, ...lines].join("\r\n"));
});

tix.post("/from-issue", requireProject("member"), async (req, res) => {
  const { projectId, issueId } = req.body || {};
  if (!projectId || !issueId) return res.status(400).json({ error: "projectId & issueId" });
  const { rows } = await db.execute(sql`select title, description from integration_issues where id = ${issueId}`);
  const i = rows?.[0];
  if (!i) return res.status(404).json({ error: "issue not found" });
  const ins = await db.execute(
    sql`insert into tickets (project_id, source, source_id, title, description, status) values (${projectId}, 'issue', ${issueId}, ${i.title}, ${i.description || null}, 'triage') returning id`
  );
  res.json({ ok: true, id: ins.rows?.[0]?.id });
});

tix.post("/from-action", requireProject("member"), async (req, res) => {
  const { projectId, actionId } = req.body || {};
  if (!projectId || !actionId) return res.status(400).json({ error: "projectId & actionId" });
  const { rows } = await db.execute(sql`select title from actions where id = ${actionId}`);
  const a = rows?.[0];
  if (!a) return res.status(404).json({ error: "action not found" });
  const ins = await db.execute(
    sql`insert into tickets (project_id, source, source_id, title, status) values (${projectId}, 'action', ${actionId}, ${a.title}, 'triage') returning id`
  );
  res.json({ ok: true, id: ins.rows?.[0]?.id });
});
