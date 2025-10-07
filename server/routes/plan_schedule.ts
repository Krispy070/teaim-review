import { Router } from "express";
import { db } from "../db/client";
import { requireProject } from "../auth/projectAccess";
import { sql } from "drizzle-orm";

export const ps = Router();

function addDays(iso: string | null, days: number) {
  if (!iso) return null;
  const d = new Date(iso); d.setUTCDate(d.getUTCDate() + days); return d.toISOString();
}

function diffDays(a?: string | null, b?: string | null) {
  if (!a || !b) return null;
  const A = new Date(a).getTime(), B = new Date(b).getTime();
  return Math.round((A - B) / (24 * 3600 * 1000));
}

ps.post("/tasks/deps", requireProject("member"), async (req, res) => {
  const { projectId, taskId, dependsOn = [] } = req.body || {};
  if (!projectId || !taskId) return res.status(400).json({ error: "projectId & taskId" });
  await db.execute(
    sql`update plan_tasks set depends_on=${JSON.stringify(dependsOn)} where id=${taskId} and project_id=${projectId}`
  );
  res.json({ ok: true });
});

ps.post("/tasks/shift", requireProject("member"), async (req, res) => {
  const { projectId, planId, fromTaskId, deltaDays = 0, cascade = true } = req.body || {};
  if (!projectId || !planId || !fromTaskId) return res.status(400).json({ error: "projectId, planId, fromTaskId" });

  const { rows: tasks } = await db.execute(
    sql`select id, start_at as "startAt", due_at as "dueAt", depends_on as "dependsOn"
       from plan_tasks where project_id=${projectId} and plan_id=${planId}`
  );

  const adj = new Map<string, string[]>();
  for (const t of tasks) {
    for (const d of (t.dependsOn || [])) {
      const list = adj.get(d) || [];
      list.push(t.id);
      adj.set(d, list);
    }
  }

  const visited = new Set<string>();
  const order: string[] = [];
  const q: string[] = [fromTaskId];
  while (q.length) {
    const cur = q.shift()!;
    if (visited.has(cur)) continue;
    visited.add(cur); order.push(cur);
    if (cascade) {
      for (const nxt of (adj.get(cur) || [])) q.push(nxt);
    }
  }

  let updated = 0;
  for (const id of order) {
    const t = tasks.find(x => x.id === id);
    if (!t) continue;
    const start = t.startAt ? addDays(t.startAt, deltaDays) : null;
    const due   = t.dueAt   ? addDays(t.dueAt,   deltaDays) : null;
    await db.execute(
      sql`update plan_tasks set start_at=${start}, due_at=${due} where id=${id} and project_id=${projectId}`
    );
    updated++;
  }

  res.json({ ok: true, updated, tasks: order });
});

ps.get("/export.csv", requireProject("member"), async (req, res) => {
  const pid = String(req.query.projectId || "");
  const owner = String(req.query.owner || "").trim().toLowerCase();

  const planRow = (await db.execute(
    sql`select id, title from project_plans where project_id=${pid} and is_active=true order by created_at desc limit 1`
  )).rows?.[0];

  res.setHeader("Content-Type","text/csv; charset=utf-8");

  if (!planRow) {
    return res.end("title,module,owner,startAt,dueAt,status,priority,baselineStart,baselineDue,varStart,varDue\n");
  }

  const ownerPattern = `%${owner}%`;
  const { rows } = owner 
    ? await db.execute(
        sql`select title, module, owner, start_at as "startAt", due_at as "dueAt", status, priority,
                baseline_start_at as "baselineStart", baseline_due_at as "baselineDue"
           from plan_tasks
          where project_id=${pid} and plan_id=${planRow.id} and lower(owner) like ${ownerPattern}
          order by order_index asc, created_at asc`
      )
    : await db.execute(
        sql`select title, module, owner, start_at as "startAt", due_at as "dueAt", status, priority,
                baseline_start_at as "baselineStart", baseline_due_at as "baselineDue"
           from plan_tasks
          where project_id=${pid} and plan_id=${planRow.id}
          order by order_index asc, created_at asc`
      );

  const diffDaysInline = (a?:string|null, b?:string|null) => {
    if (!a || !b) return "";
    const A = new Date(a).getTime(), B = new Date(b).getTime();
    return String(Math.round((A-B)/(24*3600*1000)));
  };

  const esc = (v:any)=>`"${String(v??"").replace(/"/g,'""')}"`;
  const lines = [
    "title,module,owner,startAt,dueAt,status,priority,baselineStart,baselineDue,varStart,varDue",
    ...rows.map((r:any)=>[
      r.title,r.module||"",r.owner||"",r.startAt||"",r.dueAt||"",r.status||"",r.priority,
      r.baselineStart||"",r.baselineDue||"",
      diffDaysInline(r.startAt,r.baselineStart), diffDaysInline(r.dueAt,r.baselineDue)
    ].map(esc).join(","))
  ].join("\r\n");
  res.end(lines);
});

ps.get("/export.ics", requireProject("member"), async (req, res) => {
  const pid = String(req.query.projectId || "");
  const planRow = (await db.execute(
    sql`select id, title from project_plans where project_id=${pid} and is_active=true order by created_at desc limit 1`
  )).rows?.[0];
  const toUTC = (iso:string)=> {
    const d = new Date(iso);
    const pad = (n:number)=>String(n).padStart(2,"0");
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
  };
  const { rows } = planRow ? await db.execute(
    sql`select id, title, start_at as "startAt", due_at as "dueAt" from plan_tasks
      where project_id=${pid} and plan_id=${planRow.id} and (start_at is not null or due_at is not null)
      order by coalesce(start_at, due_at) asc`
  ) : { rows: [] };

  const lines = ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//TEAIM Plan//EN"];
  for (const t of rows||[]) {
    const st = t.startAt ? toUTC(t.startAt) : (t.dueAt ? toUTC(t.dueAt) : null);
    const en = t.dueAt ? toUTC(t.dueAt) : (t.startAt ? toUTC(t.startAt) : null);
    if (!st || !en) continue;
    lines.push("BEGIN:VEVENT",
      `UID:${t.id}@teaim.app`,
      `DTSTAMP:${toUTC(new Date().toISOString())}`,
      `DTSTART:${st}`,
      `DTEND:${en}`,
      `SUMMARY:${t.title}`,
      "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  res.type("text/calendar").send(lines.join("\r\n"));
});

ps.post("/baseline/set", requireProject("member"), async (req, res) => {
  const { projectId, planId, ids = [] } = req.body || {};
  if (!projectId || !planId) return res.status(400).json({ error: "projectId & planId" });

  const result = ids?.length
    ? await db.execute(
      sql`update plan_tasks
         set baseline_start_at = start_at,
             baseline_due_at = due_at,
             baseline_set_at = now()
       where project_id=${projectId} and plan_id=${planId} and id in (${sql.join(ids.map(id => sql`${id}`), sql`, `)})`
    )
    : await db.execute(
      sql`update plan_tasks
         set baseline_start_at = start_at,
             baseline_due_at = due_at,
             baseline_set_at = now()
       where project_id=${projectId} and plan_id=${planId}`
    );

  res.json({ ok: true, updated: result.rowCount || 0 });
});

ps.post("/baseline/clear", requireProject("member"), async (req, res) => {
  const { projectId, planId, ids = [] } = req.body || {};
  if (!projectId || !planId) return res.status(400).json({ error: "projectId & planId" });

  const result = ids?.length
    ? await db.execute(
      sql`update plan_tasks
         set baseline_start_at = null,
             baseline_due_at = null,
             baseline_set_at = null
       where project_id=${projectId} and plan_id=${planId} and id in (${sql.join(ids.map(id => sql`${id}`), sql`, `)})`
    )
    : await db.execute(
      sql`update plan_tasks
         set baseline_start_at = null,
             baseline_due_at = null,
             baseline_set_at = null
       where project_id=${projectId} and plan_id=${planId}`
    );

  res.json({ ok: true, updated: result.rowCount || 0 });
});

ps.post("/tasks/snooze", requireProject("member"), async (req, res) => {
  const { projectId, taskId, untilISO = null } = req.body || {};
  if (!projectId || !taskId) return res.status(400).json({ error: "projectId & taskId" });
  await db.execute(
    sql`update plan_tasks set snooze_until=${untilISO} where id=${taskId} and project_id=${projectId}`
  );
  res.json({ ok: true });
});

ps.get("/export_my.csv", requireProject("member"), async (req, res) => {
  const pid   = String(req.query.projectId || "");
  const owner = String(req.query.owner || "").trim().toLowerCase();
  const scope = String(req.query.scope || "soon").toLowerCase();
  const days  = Math.min(60, Math.max(1, Number(req.query.days || "7")));

  const plan = (await db.execute(
    sql`select id from project_plans where project_id=${pid} and is_active=true order by created_at desc limit 1`
  )).rows?.[0];
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  if (!plan) return res.end("title,module,owner,startAt,dueAt,status,priority\n");

  const where: string[] = [`project_id=$1`, `plan_id=$2`, `status <> 'done'`, `due_at is not null`];
  const params: any[]   = [pid, plan.id];

  if (owner) { where.push(`lower(coalesce(owner,'')) like $${params.length+1}`); params.push(`%${owner}%`); }

  if (scope === "soon") {
    where.push(`due_at between now() and now() + ($${params.length+1} || ' days')::interval`);
    params.push(String(days));
  } else {
    where.push(`due_at < now()`);
  }

  const rows = (await db.execute(
    sql.raw(`select title, module, owner, start_at as "startAt", due_at as "dueAt", status, priority
       from plan_tasks
      where ${where.join(" and ")}
      order by due_at asc`),
    params as any
  )).rows || [];

  const esc = (v:any)=>`"${String(v??"").replace(/"/g,'""')}"`;
  const header = "title,module,owner,startAt,dueAt,status,priority";
  const lines = rows.map((r:any)=>[
    r.title, r.module||"", r.owner||"", r.startAt||"", r.dueAt||"", r.status||"", r.priority
  ].map(esc).join(","));
  res.end([header, ...lines].join("\r\n"));
});

export default ps;
