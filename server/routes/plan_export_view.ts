import { Router } from "express";
import { db } from "../db/client";
import { requireProject } from "../auth/projectAccess";
import { sql } from "drizzle-orm";

export const pexp = Router();

/* GET /api/plan/export_view.csv?projectId=&ownerContains=&status=&hasTicket=1&overdue=1&dueWithinDays=&q=
 * Exports from the active plan.
 */
pexp.get("/export_view.csv", requireProject("member"), async (req,res)=>{
  const pid   = String(req.query.projectId||"");
  const owner = String(req.query.ownerContains||"").toLowerCase();
  const st    = String(req.query.status||"");
  const hasT  = String(req.query.hasTicket||"")==="1";
  const over  = String(req.query.overdue||"")==="1";
  const dueIn = Number(req.query.dueWithinDays||"");
  const q     = String(req.query.q||"").toLowerCase();

  const plan = (await db.execute(
    sql`select id from project_plans where project_id=${pid} and is_active=true order by created_at desc limit 1`
  )).rows?.[0];
  res.type("text/csv");
  if (!plan) return res.end("title,module,owner,startAt,dueAt,status,priority,ticketId\n");

  const where:any[] = [sql`project_id=${pid}`, sql`plan_id=${plan.id}`];

  if (owner) where.push(sql`lower(coalesce(owner,'')) like ${`%${owner}%`}`);
  if (st)    where.push(sql`status=${st}`);
  if (hasT)  where.push(sql`ticket_id is not null`);
  if (over)  where.push(sql`status<>'done' and due_at is not null and due_at < now()`);
  if (!Number.isNaN(dueIn) && dueIn>0) {
    const days = String(Math.min(60, Math.max(1, dueIn)));
    where.push(sql`status<>'done' and due_at is not null and due_at between now() and now() + (${days} || ' days')::interval`);
  }
  if (q) {
    const pattern = `%${q}%`;
    where.push(sql`(lower(title) like ${pattern} or lower(coalesce(module,'')) like ${pattern} or lower(coalesce(owner,'')) like ${pattern})`);
  }

  const whereCombined = where.reduce((acc, curr, i) => i === 0 ? curr : sql`${acc} and ${curr}`);
  const rows = (await db.execute(
    sql`select title, module, owner, start_at as "startAt", due_at as "dueAt", status, priority, ticket_id as "ticketId"
       from plan_tasks where ${whereCombined} order by created_at desc`
  )).rows || [];

  const esc=(v:any)=>`"${String(v??"").replace(/"/g,'""')}"`;
  const head="title,module,owner,startAt,dueAt,status,priority,ticketId";
  const out = rows.map((r:any)=>[r.title,r.module||"",r.owner||"",r.startAt||"",r.dueAt||"",r.status||"",r.priority||"",r.ticketId||""].map(esc).join(","));
  res.end([head, ...out].join("\r\n"));
});

export default pexp;
