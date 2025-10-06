import { Router } from "express";
import { db } from "../db/client";
import { requireProject } from "../auth/projectAccess";
import { sql } from "drizzle-orm";

export const rbulk = Router();

/* POST /api/releases/:id/tests/bulk
 * { projectId, ids:[uuid], set:{ status? } }
 */
rbulk.post("/:id/tests/bulk", requireProject("member"), async (req,res)=>{
  const rid = String(req.params.id||"");
  const { projectId, ids=[], set={} } = req.body||{};
  if (!projectId || !rid || !Array.isArray(ids) || !ids.length) return res.status(400).json({ error:"projectId, releaseId, ids" });
  
  if (set.status === undefined) return res.json({ ok:true, updated:0 });

  const r = await db.execute(
    sql`update test_cases set status=${set.status}
       where project_id=${projectId} and release_id=${rid}
         and id = any(${ids}::uuid[])`
  );
  res.json({ ok:true, updated:r.rowCount||0 });
});

/* POST /api/releases/:id/tests/bulk-by-filter
 * { projectId, filter:{ module?, status?, requiredOnly? }, set:{ status? } }
 */
rbulk.post("/:id/tests/bulk-by-filter", requireProject("member"), async (req,res)=>{
  const rid = String(req.params.id||"");
  const { projectId, filter={}, set={} } = req.body||{};
  if (!projectId || !rid) return res.status(400).json({ error:"projectId, releaseId" });
  if (set.status === undefined) return res.json({ ok:true, updated:0 });

  let query = sql`update test_cases set status=${set.status} where project_id=${projectId} and release_id=${rid}`;
  
  if (filter.module) {
    query = sql`${query} and module=${filter.module}`;
  }
  if (filter.status) {
    query = sql`${query} and status=${filter.status}`;
  }
  if (filter.requiredOnly) {
    query = sql`${query} and is_required = true`;
  }

  const r = await db.execute(query);
  res.json({ ok:true, updated: r.rowCount||0 });
});

export default rbulk;
