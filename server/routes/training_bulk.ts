import { Router } from "express";
import { requireProject } from "../auth/projectAccess";
import { db } from "../db/client";

export const trainingBulk = Router();

/* Bulk schedule by base date + optional phase/module offsets + duration */
trainingBulk.post("/bulk-schedule", requireProject("member"), async (req, res) => {
  const { projectId, ids, baseDate, phaseOffsets = {}, moduleOffsets = {}, defaultStartHour = 9, defaultDurationHours = 2 } = req.body || {};
  if (!projectId || !Array.isArray(ids) || !ids.length || !baseDate) return res.status(400).json({ error:"projectId, ids[], baseDate required" });

  const base = new Date(baseDate);
  const { rows } = await db.execute(
    `select id, phase, module, hours from training_plan where project_id=$1 and id = any($2)`,
    [projectId, ids] as any
  );

  let updated = 0;
  const promises = [];
  for (const r of rows){
    const pOff = Number((phaseOffsets as any)[r.phase] || 0);
    const mOff = Number((moduleOffsets as any)[r.module] || 0);
    const offsetDays = pOff + mOff;
    const start = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()+offsetDays, defaultStartHour, 0, 0));
    const durH = Number(r.hours) || Number(defaultDurationHours) || 1;
    const end = new Date(start.getTime() + durH*60*60*1000);

    promises.push(
      db.execute(
        `update training_plan set start_at=$1, end_at=$2, status=case when status='planned' then 'scheduled' else status end
         where id=$3`,
        [start.toISOString(), end.toISOString(), r.id] as any
      )
    );
    updated++;
  }
  await Promise.all(promises);

  res.json({ ok:true, updated });
});

/* Bulk mass update — set owner/status for selected */
trainingBulk.post("/bulk-update", requireProject("member"), async (req, res) => {
  const { projectId, ids, owner, status } = req.body || {};
  if (!projectId || !Array.isArray(ids) || !ids.length) return res.status(400).json({ error:"projectId & ids required" });
  const sets:string[] = []; const params:any[] = [projectId];
  if (owner !== undefined) { params.push(owner||null); sets.push(`owner=$${params.length}`); }
  if (status !== undefined) { params.push(status||null); sets.push(`status=$${params.length}`); }
  if (sets.length === 0) return res.json({ ok:true, updated: 0 });
  
  params.push(ids);
  await db.execute(`update training_plan set ${sets.join(", ")} where project_id=$1 and id = any($${params.length})`, params as any);
  res.json({ ok:true, updated: ids.length });
});
