import { Router } from "express";
import { db } from "../db/client";
import { requireProject } from "../auth/projectAccess";
import { sql } from "drizzle-orm";

export const alerts = Router();

alerts.get("/settings", requireProject("member"), async (req,res)=>{
  const pid = String(req.query.projectId||"");
  const { rows } = await db.execute(
    sql`select project_id as "projectId", recipients, errors_5m_threshold as "errors5mThreshold",
            queue_stuck_mins as "queueStuckMins", enable_training_emails as "enableTrainingEmails",
            enable_cadence_emails as "enableCadenceEmails"
       from alert_settings where project_id=${pid}`);
  res.json({ ok:true, settings: rows?.[0] || null });
});

alerts.post("/settings", requireProject("member"), async (req,res)=>{
  const { projectId, recipients=[], errors5mThreshold=5, queueStuckMins=15,
          enableTrainingEmails=true, enableCadenceEmails=true } = req.body || {};
  if (!projectId) return res.status(400).json({ error:"projectId required" });
  const recipientsJson = JSON.stringify(recipients);
  await db.execute(
    sql`insert into alert_settings (project_id, recipients, errors_5m_threshold, queue_stuck_mins, enable_training_emails, enable_cadence_emails)
     values (${projectId},${recipientsJson},${errors5mThreshold},${queueStuckMins},${!!enableTrainingEmails},${!!enableCadenceEmails})
     on conflict (project_id) do update set recipients=${recipientsJson}, errors_5m_threshold=${errors5mThreshold}, queue_stuck_mins=${queueStuckMins},
       enable_training_emails=${!!enableTrainingEmails}, enable_cadence_emails=${!!enableCadenceEmails}, updated_at=now()`
  );
  res.json({ ok:true });
});
