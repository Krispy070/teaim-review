import { Router } from "express";
import { pool } from "../db/client";
import { requireProject } from "../auth/projectAccess";

export const op = Router();

/* GET /api/onboarding/pushed_last?projectId= -> { count, stepId, planId, at } */
op.get("/pushed_last", requireProject("member"), async (req,res)=>{
  const pid = String(req.query.projectId||"");
  try {
    const result = await pool.query(
      `select pushed_count as count, step_id as "stepId", plan_id as "planId", created_at as "at"
         from onboarding_push_log
        where project_id=$1
        order by created_at desc limit 1`, [pid]
    );
    const row = result.rows?.[0] || null;
    res.json({ ok:true, last: row });
  } catch (err: any) {
    // Handle missing table gracefully
    if (err.code === '42P01') { // relation does not exist
      res.json({ ok:true, last: null });
    } else {
      throw err;
    }
  }
});

export default op;
