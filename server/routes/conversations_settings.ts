import { Router } from "express";
import { db } from "../db/client";
import { requireProject } from "../auth/projectAccess";

export const convSettings = Router();

// GET /api/conversations/sweep-settings?projectId=
convSettings.get("/sweep-settings", requireProject("member"), async (req, res) => {
  const pid = String(req.query.projectId || "");
  const { rows } = await db.execute(
    `select coalesce(conversation_sweep_enabled,true) as "enabled",
            coalesce(conversation_sweep_days,3)     as "days",
            coalesce(conversation_sweep_time_utc,'02:30') as "timeUTC",
            conversation_sweep_last_at as "lastAt"
       from project_settings where project_id=$1`, [pid] as any
  );
  const r = rows?.[0] || { enabled:true, days:3, timeUTC:"02:30", lastAt:null };
  res.json({ ok:true, ...r });
});

// POST /api/conversations/sweep-settings  { projectId, enabled?, days?, timeUTC? }
convSettings.post("/sweep-settings", requireProject("member"), async (req, res) => {
  const { projectId, enabled, days, timeUTC } = req.body || {};
  if (!projectId) return res.status(400).json({ error:"projectId required" });

  await db.execute(
    `insert into project_settings (project_id, conversation_sweep_enabled, conversation_sweep_days, conversation_sweep_time_utc)
     values ($1, coalesce($2,true), coalesce($3,3), coalesce($4,'02:30'))
     on conflict (project_id)
     do update set conversation_sweep_enabled=coalesce($2,conversation_sweep_enabled),
                   conversation_sweep_days=coalesce($3,conversation_sweep_days),
                   conversation_sweep_time_utc=coalesce($4,conversation_sweep_time_utc),
                   updated_at=now()`,
    [projectId, enabled, days, timeUTC] as any
  );
  res.json({ ok:true });
});
