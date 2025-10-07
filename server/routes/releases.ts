import { Router } from "express";
import { requireRole } from "../auth/supabaseAuth";
import { requireProject } from "../auth/projectAccess";
import { requireProjectId, ensureUUIDParam } from "../auth/guards";
import { asyncHandler } from "../middleware/errorHandler";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { oneOf, toBool } from "../lib/validate";
import { makeUploader } from "../lib/uploader";
import { csvSafe, setDownloadHeaders } from "../lib/csv";

const upload = makeUploader();

function fmtICS(ts: string | Date) {
  const d = typeof ts === "string" ? new Date(ts) : ts;
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = d.getUTCFullYear();
  const m = pad(d.getUTCMonth() + 1);
  const s = pad(d.getUTCDate());
  const hh = pad(d.getUTCHours());
  const mm = pad(d.getUTCMinutes());
  const ss = pad(d.getUTCSeconds());
  return `${y}${m}${s}T${hh}${mm}${ss}Z`;
}

export const releases = Router();

// create a release (simple admin tool)
releases.post("/add", requireRole("admin"), async (req, res, next) => {
  try {
    const { projectId, title, description, startsAt, endsAt } = req.body || {};
    if (!projectId || !title || !startsAt) return res.status(400).json({ error: "projectId, title, startsAt required" });
    const result = await db.execute(
      sql`insert into releases (project_id, title, description, starts_at, ends_at)
       values (${projectId}, ${title}, ${description ?? null}, ${startsAt}, ${endsAt ?? null})
       returning id`
    );
    res.json({ ok: true, id: result.rows?.[0]?.id });
  } catch (e) { next(e); }
});

// list
releases.get("/list", requireRole("member"), async (req, res, next) => {
  try {
    const projectId = req.query.projectId as string;
    if (!projectId) return res.status(400).json({ error: "projectId required" });
    const result = await db.execute(
      sql`select id, title, description, starts_at as "startsAt", ends_at as "endsAt", created_at as "createdAt"
       from releases where project_id = ${projectId}
       order by starts_at desc limit 100`
    );
    res.json({ ok: true, items: result.rows || [] });
  } catch (e) { next(e); }
});

// ICS feed — if no explicit releases, synthesize from docs
releases.get("/ics", requireRole("member"), async (req, res, next) => {
  try {
    const projectId = req.query.projectId as string;
    if (!projectId) return res.status(400).json({ error: "projectId required" });

    const result = await db.execute(
      sql`select id, title, description, starts_at as "startsAt", ends_at as "endsAt"
       from releases where project_id = ${projectId} order by starts_at asc`
    );

    let events = result.rows;

    if (!events?.length) {
      // fallback: make events from recent docs
      const docsResult = await db.execute(
        sql`select id, name as title, created_at as "startsAt"
         from docs where project_id = ${projectId} and deleted_at is null
         order by created_at desc limit 10`
      );
      events = docsResult.rows.map((d:any) => ({ id: d.id, title: `Doc: ${d.title}`, description: "Ingested document", startsAt: d.startsAt, endsAt: null }));
    }

    const now = new Date();
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//TEAIM//Releases//EN",
      ...events.flatMap((e: any) => ([
        "BEGIN:VEVENT",
        `UID:${e.id}@teaim.app`,
        `DTSTAMP:${fmtICS(now)}`,
        `DTSTART:${fmtICS(e.startsAt)}`,
        ...(e.endsAt ? [`DTEND:${fmtICS(e.endsAt)}`] : []),
        `SUMMARY:${(e.title || "Release").replace(/\r?\n/g, " ")}`,
        ...(e.description ? [`DESCRIPTION:${(e.description || "").replace(/\r?\n/g, " ")}`] : []),
        "END:VEVENT"
      ])),
      "END:VCALENDAR"
    ];

    const ics = lines.join("\r\n");
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="project_${projectId}.ics"`);
    res.send(ics);
  } catch (e) { next(e); }
});

/* GET /api/releases/:id/tests/summary?projectId= */
releases.get("/:id/tests/summary", ensureUUIDParam("id"), requireRole("member"), async (req,res, next)=>{
  try {
    const rid=String(req.params.id||""); const pid=String(req.query.projectId||"");
    const byMod = (await db.execute(
      sql`select module, 
          sum(case when status='planned' then 1 else 0 end)::int as planned,
          sum(case when status='in_progress' then 1 else 0 end)::int as in_progress,
          sum(case when status='blocked' then 1 else 0 end)::int as blocked,
          sum(case when status='passed' then 1 else 0 end)::int as passed,
          sum(case when status='failed' then 1 else 0 end)::int as failed,
          sum(case when is_required then 1 else 0 end)::int as req_total,
          sum(case when is_required and status='passed' then 1 else 0 end)::int as req_passed,
          count(*)::int as total
     from test_cases
    where project_id=${pid} and release_id=${rid}
    group by module order by module`
    )).rows || [];
    
    const gate = (await db.execute(
      sql`select 
         sum(case when is_required then 1 else 0 end)::int as required,
         sum(case when is_required and status='passed' then 1 else 0 end)::int as passed
       from test_cases where project_id=${pid} and release_id=${rid}`
    )).rows?.[0] || { required: 0, passed: 0 };
    
    res.json({ ok:true, modules: byMod, gate: { required: gate.required||0, passed: gate.passed||0, ready: (gate.required||0)>0 && gate.required===gate.passed } });
  } catch (e) { next(e); }
});

/* GET /api/releases/:id/signoff/history?projectId= */
releases.get("/:id/signoff/history", requireRole("member"), async (req,res, next)=>{
  try {
    const rid=String(req.params.id||""); const pid=String(req.query.projectId||"");
    const rows = (await db.execute(
      sql`select id, status, requested_by as "requestedBy", decided_by as "decidedBy", decided_at as "decidedAt", notes, created_at as "createdAt"
         from release_signoffs
        where project_id=${pid} and release_id=${rid}
        order by created_at desc`
    )).rows || [];
    res.json({ ok:true, items: rows });
  } catch (e) { next(e); }
});

/* (Optional) toggle required for a test
   POST /api/releases/test/:testId/required { projectId, isRequired:boolean } */
releases.post("/test/:testId/required", requireRole("member"), async (req,res, next)=>{
  try {
    const tid=String(req.params.testId||""); const { projectId, isRequired=true } = req.body||{};
    if (!projectId || !tid) return res.status(400).json({ error:"projectId & testId" });
    await db.execute(sql`update test_cases set is_required=${!!isRequired} where id=${tid} and project_id=${projectId}`);
    res.json({ ok:true });
  } catch (e) { next(e); }
});

/* GET /api/releases/:id/summary.html?projectId=&print=1 */
releases.get("/:id/summary.html", requireProject("member"), async (req, res) => {
  const rid = String(req.params.id || "");
  const pid = String(req.query.projectId || "");
  const print = String(req.query.print || "") === "1";

  const meta = (await db.execute(
    sql`select code, year, title, status, imported_at as "importedAt"
       from releases where project_id=${pid} and id=${rid}`
  )).rows?.[0] || null;

  const totals = (await db.execute(
    sql`select 
       sum(case when status='planned' then 1 else 0 end)::int as planned,
       sum(case when status='in_progress' then 1 else 0 end)::int as in_progress,
       sum(case when status='blocked' then 1 else 0 end)::int as blocked,
       sum(case when status='passed' then 1 else 0 end)::int as passed,
       sum(case when status='failed' then 1 else 0 end)::int as failed,
       count(*)::int as total
     from test_cases where project_id=${pid} and release_id=${rid}`
  )).rows?.[0] || { total: 0 };

  const gate = (await db.execute(
    sql`select 
       sum(case when is_required then 1 else 0 end)::int as req_total,
       sum(case when is_required and status='passed' then 1 else 0 end)::int as req_passed
     from test_cases where project_id=${pid} and release_id=${rid}`
  )).rows?.[0] || { req_total: 0, req_passed: 0 };

  const mods = (await db.execute(
    sql`select module, 
            sum(case when status='planned' then 1 else 0 end)::int as planned,
            sum(case when status='in_progress' then 1 else 0 end)::int as in_progress,
            sum(case when status='blocked' then 1 else 0 end)::int as blocked,
            sum(case when status='passed' then 1 else 0 end)::int as passed,
            sum(case when status='failed' then 1 else 0 end)::int as failed,
            count(*)::int as total
       from test_cases
      where project_id=${pid} and release_id=${rid}
      group by module order by module`
  )).rows || [];

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  const styles = `
    <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system; margin: 24px; }
      h1,h2 { margin: 0 0 8px; }
      .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
      .card { border: 1px solid #444; border-radius: 8px; padding: 8px; }
      .ok { color: #10b981; } .warn { color: #f59e0b; } .err { color: #ef4444; }
      @media print { .noprint { display:none } }
    </style>`;

  const gateOk = ((gate.req_total || 0) as number) > 0 && ((gate.req_total || 0) === (gate.req_passed || 0));

  res.end(`<!doctype html><html><head><meta charset="utf-8">
    <title>Release ${meta?.code || ""} ${meta?.year || ""} — Sign-off summary</title>
    ${styles}</head><body>
      <div class="noprint"><button onclick="window.print()">Print</button></div>
      <h1>Release ${meta?.code || ""} ${meta?.year || ""}</h1>
      <div>Status: <b>${meta?.status || "-"}</b> • Imported: ${meta?.importedAt ? new Date(String(meta.importedAt)).toLocaleString() : "-"}</div>
      <h2 style="margin-top:16px">Gate</h2>
      <div>${gateOk
        ? `<span class="ok">✅ Ready</span> — required ${gate.req_passed}/${gate.req_total}`
        : `<span class="warn">⏳ Not ready</span> — required ${gate.req_passed}/${gate.req_total}`}</div>

      <h2 style="margin-top:16px">Totals</h2>
      <div class="grid">
        <div class="card">Passed: <b class="ok">${totals.passed || 0}</b></div>
        <div class="card">Failed: <b class="err">${totals.failed || 0}</b></div>
        <div class="card">Blocked: <b class="warn">${totals.blocked || 0}</b></div>
        <div class="card">In progress: ${totals.in_progress || 0}</div>
        <div class="card">Planned: ${totals.planned || 0}</div>
        <div class="card">Total: <b>${totals.total || 0}</b></div>
      </div>

      <h2 style="margin-top:16px">By module</h2>
      <div class="grid">
        ${mods.map((m:any)=>`
          <div class="card">
            <div><b>${m.module || "Custom"}</b></div>
            <div>✓ <span class="ok">${m.passed||0}</span> • ✗ <span class="err">${m.failed||0}</span> • ⛔ <span class="warn">${m.blocked||0}</span> • … ${m.in_progress||0}</div>
            <div>Total: ${m.total||0}</div>
          </div>
        `).join("")}
      </div>
    </body></html>`);
});

/* GET /api/releases/summaries?projectId= */
releases.get("/summaries", requireProject("member"), async (req,res)=>{
  const pid = String(req.query.projectId||"");
  const rels = (await db.execute(
    sql`select id from releases where project_id=${pid} order by imported_at desc limit 30`
  )).rows || [];
  const out:any[] = [];
  for (const r of rels) {
    const rid = r.id;

    const gate = (await db.execute(
      sql`select sum(case when is_required then 1 else 0 end)::int as required,
              sum(case when is_required and status='passed' then 1 else 0 end)::int as passed
         from test_cases where project_id=${pid} and release_id=${rid}`
    )).rows?.[0] || { required:0, passed:0 };

    const modules = (await db.execute(
      sql`select module,
              sum(case when status='passed'      then 1 else 0 end)::int as passed,
              sum(case when status='failed'      then 1 else 0 end)::int as failed,
              sum(case when status='blocked'     then 1 else 0 end)::int as blocked,
              sum(case when status='in_progress' then 1 else 0 end)::int as in_progress,
              sum(case when is_required          then 1 else 0 end)::int as req_total,
              sum(case when is_required and status='passed' then 1 else 0 end)::int as req_passed,
              count(*)::int as total
         from test_cases
        where project_id=${pid} and release_id=${rid}
        group by module order by module`
    )).rows || [];

    out.push({
      releaseId: rid,
      gate: { required: gate.required||0, passed: gate.passed||0, ready: ((gate.required||0) as number)>0 && (gate.required===gate.passed) },
      modules
    });
  }
  res.json({ ok:true, items: out });
});

releases.get("/:id/tests", requireProject("member"), async (req,res)=>{
  const rid   = String(req.params.id||"");
  const pid   = String(req.query.projectId||"");
  const mod   = String(req.query.module||"").trim();
  const st    = String(req.query.status||"").trim().toLowerCase();
  const reqOnly = toBool(req.query.requiredOnly);
  const search= String(req.query.search||"").trim();
  const owner = String(req.query.owner||"").trim();
  const orderOk = oneOf(["createdAt","dueAt","status","title"] as const);
  const dirOk   = oneOf(["asc","desc"] as const);
  const orderParam = String(req.query.order||"createdAt");
  const dirParam = String(req.query.dir||"desc").toLowerCase();
  const order = orderOk(orderParam) ? orderParam : "createdAt";
  const dir   = dirOk(dirParam) ? dirParam : "desc";
  const limit = Math.min(200, Math.max(1, Number(req.query.limit||"100")));
  const offset= Math.max(0, Number(req.query.offset||"0"));

  const where:string[] = [`project_id=$1`,`release_id=$2`];
  const params:any[]   = [pid, rid];

  if (mod) { where.push(`module=$${params.length+1}`); params.push(mod); }
  if (st)  { where.push(`lower(status)=$${params.length+1}`); params.push(st); }
  if (reqOnly) where.push(`is_required = true`);
  if (search) { where.push(`(lower(title) like $${params.length+1} or lower(module) like $${params.length+2})`); params.push(`%${search.toLowerCase()}%`, `%${search.toLowerCase()}%`); }
  if (owner) { where.push(`lower(owner) like $${params.length+1}`); params.push(`%${owner.toLowerCase()}%`); }

  const orderSql =
    order==="dueAt"    ? `coalesce(due_at, created_at)` :
    order==="status"   ? `status` :
    order==="title"    ? `title` : `created_at`;

  const rows = (await db.execute(
    `select id, module, title, owner, status, due_at as "dueAt", is_required as "isRequired", created_at as "createdAt"
       from test_cases
      where ${where.join(" and ")}
      order by ${orderSql} ${dir}
      limit ${limit} offset ${offset}`, params as any
  )).rows || [];

  res.json({ ok:true, items: rows, meta:{ limit, offset } });
});

/* GET /api/releases/:id/tests/export.csv?projectId=&module=&status=&requiredOnly=&search=&owner=&order=&dir= */
releases.get("/:id/tests/export.csv", requireProject("member"), async (req,res)=>{
  const rid   = String(req.params.id||"");
  const pid   = String(req.query.projectId||"");
  const mod   = String(req.query.module||"").trim();
  const st    = String(req.query.status||"").trim().toLowerCase();
  const reqOnly = String(req.query.requiredOnly||"0")==="1";
  const search= String(req.query.search||"").trim();
  const owner = String(req.query.owner||"").trim();
  const order = (String(req.query.order||"createdAt") as "createdAt"|"dueAt"|"status"|"title");
  const dir   = (String(req.query.dir||"desc").toLowerCase()==="asc" ? "asc" : "desc");

  const where:string[] = [`project_id=$1`,`release_id=$2`];
  const params:any[]   = [pid, rid];
  if (mod) where.push(`module=$${params.length+1}`), params.push(mod);
  if (st)  where.push(`lower(status)=$${params.length+1}`), params.push(st);
  if (reqOnly) where.push(`is_required = true`);
  if (search) { where.push(`(lower(title) like $${params.length+1} or lower(module) like $${params.length+2})`); params.push(`%${search.toLowerCase()}%`, `%${search.toLowerCase()}%`); }
  if (owner) { where.push(`lower(owner) like $${params.length+1}`); params.push(`%${owner.toLowerCase()}%`); }

  const orderSql =
    order==="dueAt"    ? `coalesce(due_at, created_at)` :
    order==="status"   ? `status` :
    order==="title"    ? `title` : `created_at`;

  const rows = (await db.execute(
    `select module, title, owner, status, due_at as "dueAt", is_required as "isRequired", created_at as "createdAt"
       from test_cases where ${where.join(" and ")} order by ${orderSql} ${dir}`, params as any
  )).rows || [];

  setDownloadHeaders(res, `release-${rid}-tests.csv`);
  const head="module,title,owner,status,dueAt,required,createdAt";
  const out = rows.map((r:any)=>[
    r.module||"", r.title, r.owner||"", r.status||"", r.dueAt||"", r.isRequired?"yes":"no", r.createdAt
  ].map(csvSafe).join(","));
  res.send([head, ...out].join("\r\n"));
});
