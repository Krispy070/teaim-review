import { Router } from "express";
import { db } from "../db/client";
import { requireProject } from "../auth/projectAccess";
import { sql } from "drizzle-orm";

export const tsla = Router();

tsla.get("/", requireProject("member"), async (req, res) => {
  const pid = String(req.query.projectId || "");
  const { rows } = await db.execute(
    sql`select id, priority, first_response_mins as "firstResponseMins", resolution_mins as "resolutionMins"
       from ticket_sla_policies where project_id=${pid} order by
         case priority when 'critical' then 1 when 'high' then 2 when 'med' then 3 else 4 end`
  );
  res.json({ ok: true, items: rows || [] });
});

tsla.post("/upsert", requireProject("member"), async (req, res) => {
  const { projectId, priority, firstResponseMins = 240, resolutionMins = 2880 } = req.body || {};
  if (!projectId || !priority) return res.status(400).json({ error: "projectId & priority" });
  
  await db.execute(
    sql`insert into ticket_sla_policies (project_id, priority, first_response_mins, resolution_mins)
     values (${projectId}, ${priority}, ${firstResponseMins}, ${resolutionMins})
     on conflict (project_id, priority)
     do update set first_response_mins=${firstResponseMins}, resolution_mins=${resolutionMins}`
  );
  
  res.json({ ok: true });
});
