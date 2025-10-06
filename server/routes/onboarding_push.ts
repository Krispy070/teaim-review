import { Router } from "express";
import { db } from "../db/client";
import { requireProject } from "../auth/projectAccess";

export const op = Router();

/* GET /api/onboarding/pushed_last?projectId= -> { count, stepId, planId, at } */
op.get("/pushed_last", requireProject("member"), async (req,res)=>{
  const pid = String(req.query.projectId||"");
  const row = (await db.execute(
    `select pushed_count as count, step_id as "stepId", plan_id as "planId", created_at as "at"
       from onboarding_push_log
      where project_id=$1
      order by created_at desc limit 1`, [pid] as any
  )).rows?.[0] || null;
  res.json({ ok:true, last: row });
});

export default op;
