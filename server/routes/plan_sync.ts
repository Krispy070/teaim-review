import { Router } from "express";
import { db } from "../db/client";
import { requireProject } from "../auth/projectAccess";
import { sql } from "drizzle-orm";

export const psync = Router();

psync.post("/push", requireProject("member"), async (req,res)=>{
  const { projectId, planId, ids=[] } = req.body||{};
  if (!projectId || !planId) return res.status(400).json({ error:"projectId & planId" });

  const { rows: tasks } = ids?.length 
    ? await db.execute(
        sql`select t.id, t.title, t.owner, t.due_at as "dueAt", t.priority, t.status, t.action_id as "actionId"
           from plan_tasks t where t.project_id=${projectId} and t.plan_id=${planId} and t.id in (${sql.join(ids.map((id: string) => sql`${id}`), sql`, `)})`
      )
    : await db.execute(
        sql`select t.id, t.title, t.owner, t.due_at as "dueAt", t.priority, t.status, t.action_id as "actionId"
           from plan_tasks t where t.project_id=${projectId} and t.plan_id=${planId}`
      );

  let created=0, updated=0;
  for (const t of tasks) {
    if (t.actionId) {
      await db.execute(
        sql`update actions set title=${t.title}, owner=${t.owner||null}, due_date=${t.dueAt||null}, status=${mapStatus(t.status)}
          where id=${String(t.actionId)} and project_id=${projectId}`
      );
      updated++;
    } else {
      const ins = await db.execute(
        sql`insert into actions (org_id, project_id, title, owner, due_date, status)
         values ((select org_id from projects where id=${projectId}),${projectId},${t.title},${t.owner||null},${t.dueAt||null},${mapStatus(t.status)}) returning id`
      );
      const aid = String(ins.rows?.[0]?.id);
      await db.execute(sql`update plan_tasks set action_id=${aid} where id=${t.id}`);
      created++;
    }
  }

  res.json({ ok:true, created, updated });

  function mapStatus(s:any){ const x=String(s||"").toLowerCase(); return x==="done"?"completed":x==="in_progress"?"in_progress":"pending"; }
});

psync.post("/pull", requireProject("member"), async (req,res)=>{
  const { projectId, planId } = req.body||{};
  if (!projectId || !planId) return res.status(400).json({ error:"projectId & planId" });

  const { rows: tasks } = await db.execute(
    sql`select t.id, t.action_id as "actionId" from plan_tasks t where t.project_id=${projectId} and t.plan_id=${planId} and t.action_id is not null`
  );

  let updated=0;
  for (const t of tasks) {
    const { rows: a } = await db.execute(
      sql`select title, owner, due_date as "dueAt", status from actions where id=${t.actionId} and project_id=${projectId}`
    );
    const act = a?.[0]; if (!act) continue;
    await db.execute(
      sql`update plan_tasks set title=${act.title}, owner=${act.owner||null}, due_at=${act.dueAt||null}, status=${mapStatus(act.status)} where id=${t.id}`
    );
    updated++;
  }
  res.json({ ok:true, updated });

  function mapStatus(s:any){ const x=String(s||"pending").toLowerCase(); return x==="completed"?"done":x==="in_progress"?"in_progress":"planned"; }
});

psync.post("/pull-tickets", requireProject("member"), async (req,res)=>{
  const { projectId, planId } = req.body||{};
  if (!projectId || !planId) return res.status(400).json({ error:"projectId & planId" });

  const { rows: tasks } = await db.execute(
    sql`select t.id, t.ticket_id as "ticketId" from plan_tasks t
      where t.project_id=${projectId} and t.plan_id=${planId} and t.ticket_id is not null`
  );
  if (!tasks?.length) return res.json({ ok:true, updated:0 });

  let updated=0;
  for (const r of tasks) {
    const { rows: tk } = await db.execute(
      sql`select title, assignee, priority, status from tickets where id=${r.ticketId} and project_id=${projectId}`
    );
    const ticket = tk?.[0];
    if (!ticket) continue;

    await db.execute(
      sql`update plan_tasks set title=${ticket.title}, owner=${ticket.assignee||null}, priority=${mapPrio(ticket.priority)}, status=${mapTicketStatus(ticket.status)} where id=${r.id}`
    );
    updated++;
  }
  res.json({ ok:true, updated });

  function mapPrio(p:any){ const x=String(p||"med").toLowerCase(); return x==="high"?20:x==="low"?80:50; }
  function mapTicketStatus(s:any){
    const x=String(s||"triage").toLowerCase();
    if (x==="closed") return "done";
    if (x==="in_progress") return "in_progress";
    if (x==="blocked"||x==="waiting"||x==="vendor") return "blocked";
    return "planned";
  }
});

export default psync;
