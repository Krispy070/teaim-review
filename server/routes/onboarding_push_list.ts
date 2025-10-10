import { Router } from "express";
import { pool } from "../db/client.js";
import { requireProject } from "../auth/projectAccess.js";

export const opl = Router();

opl.get("/pushed_list", requireProject("member"), async (req,res)=>{
  const pid = String(req.query.projectId||"");
  const limit = Math.min(200, Math.max(1, Number(req.query.limit||"50")));
  const offset= Math.max(0, Number(req.query.offset||"0"));

  try {
    const result = await pool.query(
      `select l.id, l.step_id as "stepId", s.title as "stepTitle",
              l.plan_id as "planId", l.pushed_count as "count", l.created_at as "createdAt"
         from onboarding_push_log l
         left join onboarding_steps s on s.id=l.step_id
        where l.project_id=$1
        order by l.created_at desc
        limit $2 offset $3`, [pid, limit, offset]
    );
    const rows = result.rows || [];
    res.json({ ok:true, items: rows, meta:{ limit, offset } });
  } catch (err: any) {
    // Handle missing table gracefully
    if (err.code === '42P01') { // relation does not exist
      res.json({ ok:true, items: [], meta:{ limit, offset } });
    } else {
      throw err;
    }
  }
});

export default opl;
