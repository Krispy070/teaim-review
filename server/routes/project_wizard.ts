import { Router } from "express";
import { requireProject } from "../auth/projectAccess";
import { db } from "../db/client";
import { sql } from "drizzle-orm";

export const wizard = Router();

wizard.get("/presets", requireProject("member"), async (req, res) => {
  const { rows: pbs } = await db.execute(
    sql`select id, name, domain, version from playbook_templates order by created_at desc limit 50`
  );
  const defaults = {
    cadences: [
      { name: "SteerCo Weekly", frequency: "weekly", dayOfWeek: 3, timeUtc: "17:00" },
      { name: "Workstream Sync", frequency: "weekly", dayOfWeek: 2, timeUtc: "16:00" }
    ],
    modules: ["HCM","Payroll","FIN"]
  };
  res.json({ ok: true, playbooks: pbs || [], defaults });
});

wizard.post("/apply", requireProject("admin"), async (req, res) => {
  const {
    projectId,
    company = "",
    goLiveDate,
    modules = [],
    cadences = [],
    playbookTemplateId = null,
    seedTraining = true
  } = req.body || {};
  if (!projectId) return res.status(400).json({ error: "projectId required" });

  const results:any = { releases:0, cadences:0, playbookId:null, training:0 };

  if (goLiveDate) {
    const go = new Date(goLiveDate);
    const r01 = new Date(go.getTime() - 115 * 24 * 60 * 60 * 1000);
    const par = new Date(go.getTime() - 50  * 24 * 60 * 60 * 1000);
    await db.execute(
      sql`insert into releases (project_id, title, description, starts_at)
       values (${projectId}, 'Config Sprint 1 Demo', 'First demo of core build', ${r01.toISOString()}),
              (${projectId}, 'Payroll Parallel #1 Start', 'First end-to-end payroll test', ${par.toISOString()}),
              (${projectId}, 'Go-Live', ${`Production Cutover ${company?`for ${company}`:""}`}, ${new Date(go).toISOString()})`
    );
    results.releases = 3;
  }

  for (const c of (cadences||[])) {
    await db.execute(
      sql`insert into cadences (project_id, name, frequency, dow, time_utc, attendees)
       values (${projectId}, ${c.name}, ${c.frequency||"weekly"}, ${Number(c.dayOfWeek??3)}, ${c.timeUtc||"17:00"}, ${JSON.stringify([])})`
    );
    results.cadences++;
  }

  if (playbookTemplateId) {
    const { rows: t } = await db.execute(sql`select id from playbook_templates where id=${playbookTemplateId}`);
    if (t?.length) {
      const { rows: pb } = await db.execute(
        sql`insert into playbooks (project_id, template_id, name, params, sections)
         select ${projectId}, id, concat(name, ' (', to_char(now(),'YYYY-MM-DD'), ')'), '{}'::jsonb, sections
         from playbook_templates where id=${playbookTemplateId}
         returning id`
      );
      results.playbookId = pb?.[0]?.id || null;
    }
  }

  if (seedTraining) {
    const seed:any[] = [];
    const mset = modules?.length ? modules : ["HCM","Payroll","FIN"];
    for (const m of mset) {
      if (m==="HCM") seed.push(
        { module:"HCM", phase:"Architect & Configure - Deploy", topic:"Workday Platform for Administrators", delivery:"Self-Directed", hours:30 },
        { module:"HCM", phase:"Architect & Configure - Deploy", topic:"Workday Reporting", delivery:"Instructor-Led", hours:32 }
      );
      if (m==="Payroll") seed.push(
        { module:"Payroll", phase:"Architect & Configure - Deploy", topic:"Payroll Fundamentals", delivery:"Instructor-Led", hours:24 }
      );
      if (m==="FIN") seed.push(
        { module:"FIN", phase:"Architect & Configure - Deploy", topic:"Financials Core", delivery:"Self-Directed", hours:20 }
      );
    }
    for (const r of seed) {
      await db.execute(
        sql`insert into training_plan (project_id, module, phase, topic, delivery, hours, status, source_sheet)
         values (${projectId}, ${r.module}, ${r.phase}, ${r.topic}, ${r.delivery}, ${r.hours}, 'planned', 'Wizard')`
      );
    }
    results.training = seed.length;
  }

  res.json({ ok: true, results });
});
