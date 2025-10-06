import { Router } from "express";
import { db } from "../db/client";
import { requireProject } from "../auth/projectAccess";

export const pbf = Router();

/* POST /api/plan/tasks/bulk-by-filter
 * { projectId, planId?, filter: { ownerContains?, status?, hasTicket?, overdue?, dueWithinDays?, q? }, set: { owner?, status? } }
 * If planId omitted, uses active plan.
 */
pbf.post("/tasks/bulk-by-filter", requireProject("member"), async (req:any, res)=>{
  const { projectId, planId=null, filter={}, set={} } = req.body||{};
  if (!projectId) return res.status(400).json({ error:"projectId required" });

  const plan = planId ? { id: planId } : (await db.execute(
    `select id from project_plans where project_id=$1 and is_active=true order by created_at desc limit 1`, [projectId] as any
  )).rows?.[0];
  if (!plan) return res.status(400).json({ error:"no active plan" });

  const where:string[] = [`project_id=$1`, `plan_id=$2`];
  const params:any[]   = [projectId, plan.id];

  if (filter.ownerContains){
    where.push(`lower(coalesce(owner,'')) like $${params.length+1}`); params.push(`%${String(filter.ownerContains).toLowerCase()}%`);
  }
  if (filter.status){
    where.push(`status=$${params.length+1}`); params.push(filter.status);
  }
  if (filter.hasTicket){
    where.push(`ticket_id is not null`);
  }
  if (filter.overdue){
    where.push(`status<>'done' and due_at is not null and due_at < now()`);
  }
  if (filter.dueWithinDays){
    where.push(`status<>'done' and due_at is not null and due_at between now() and now() + ($${params.length+1} || ' days')::interval`);
    params.push(String(Math.min(60, Math.max(1, Number(filter.dueWithinDays||7)))));
  }
  if (filter.q){
    where.push(`(lower(title) like $${params.length+1} or lower(coalesce(module,'')) like $${params.length+1} or lower(coalesce(owner,'')) like $${params.length+1})`);
    params.push(`%${String(filter.q).toLowerCase()}%`);
  }

  const sets:string[]=[];
  if (set.owner  !== undefined){ sets.push(`owner=$${params.length+1}`); params.push(set.owner||null); }
  if (set.status !== undefined){ sets.push(`status=$${params.length+1}`); params.push(set.status); }
  if (!sets.length) return res.json({ ok:true, updated:0 });

  const sql = `update plan_tasks set ${sets.join(", ")}, updated_at=now() where ${where.join(" and ")}`;
  const r = await db.execute(sql as any, params as any);
  res.json({ ok:true, updated: r.rowCount||0 });
});

export default pbf;
