import { Router } from "express";
import { db } from "../db/client";
import { requireProject } from "../auth/projectAccess";

export const pbulk = Router();

/* POST /api/plan/tasks/set-owner  { projectId, planId, ids:[uuid], owner:string } */
pbulk.post("/tasks/set-owner", requireProject("member"), async (req:any,res)=>{
  const { projectId, planId, ids=[], owner } = req.body||{};
  if (!projectId || !planId || !Array.isArray(ids) || !ids.length) return res.status(400).json({ error:"projectId, planId, ids" });
  await db.execute(
    `update plan_tasks set owner=$3 where project_id=$1 and plan_id=$2 and id = any($4::uuid[])`,
    [projectId, planId, owner||null, ids] as any
  );
  res.json({ ok:true, updated: ids.length });
});

export default pbulk;
