import { Router } from "express";
import { db } from "../db/client";
import { requireProject } from "../auth/projectAccess";
import { requireRole } from "../auth/supabaseAuth";
import { sql } from "drizzle-orm";

export const seed = Router();

seed.post("/defaults", requireProject("admin"), async (req, res, next) => {
  try {
    const projectId = String(req.body?.projectId || "");
    const projectCode = String(req.body?.projectCode || "PROJECT").replace(/[^A-Za-z0-9\-]/g,"");
    if (!projectId) return res.status(400).json({ error:"projectId required" });

    // Default PII policy & retention
    await db.execute(sql`
      insert into project_settings (project_id, project_code, pii_mode, allow_email_domains, allow_original_preview, retention_original_days, retention_doc_days, retention_hard_delete)
      values (${projectId},${projectCode},'strict','["kriana.com"]'::jsonb,false, 0, 0, false)
      on conflict (project_id) do nothing
    `);

    // Releases (demo/go-live placeholders)
    await db.execute(sql`
      insert into releases (project_id, title, starts_at)
      values
       (${projectId}, 'Config Sprint 1 Demo', now() + interval '14 days'),
       (${projectId}, 'Go-Live', now() + interval '120 days')
      on conflict do nothing
    `);

    res.json({ ok:true });
  } catch (e) { next(e); }
});

// POST /api/project/:projectId/seed/rich-demo (admin-gated)
seed.post("/:projectId/rich-demo", requireRole("admin"), requireProject("admin"), async (req, res, next) => {
  try {
    const projectId = String(req.params.projectId || "");
    if (!projectId) return res.status(400).json({ error:"projectId required" });

    let inserted = 0;

    // Sample actions
    const actions = [
      { title: "Finalize security matrix with IT team", category: "security", status: "open", owner: "Security Lead" },
      { title: "Review integration points for payroll", category: "integrations", status: "in_progress", owner: "Integration Specialist" },
      { title: "Complete data migration plan", category: "data", status: "done", owner: "Data Analyst" }
    ];
    for (const a of actions) {
      await db.execute(sql`
        insert into actions (project_id, title, category, status, owner)
        values (${projectId}, ${a.title}, ${a.category}, ${a.status}, ${a.owner})
        on conflict do nothing
      `);
      inserted++;
    }

    // Sample decisions
    const decisions = [
      { title: "Use phased rollout approach", category: "strategy", status: "approved", impact: "high" },
      { title: "Defer custom reporting to phase 2", category: "scope", status: "approved", impact: "medium" }
    ];
    for (const d of decisions) {
      await db.execute(sql`
        insert into decisions (project_id, title, category, status, impact)
        values (${projectId}, ${d.title}, ${d.category}, ${d.status}, ${d.impact})
        on conflict do nothing
      `);
      inserted++;
    }

    // Sample risks
    const risks = [
      { title: "Data quality issues in legacy system", category: "data", severity: "high", status: "active", mitigation: "Implement data cleansing sprints" },
      { title: "Resource availability for testing phase", category: "resource", severity: "medium", status: "active", mitigation: "Secure backup resources early" }
    ];
    for (const r of risks) {
      await db.execute(sql`
        insert into risks (project_id, title, category, severity, status, mitigation)
        values (${projectId}, ${r.title}, ${r.category}, ${r.severity}, ${r.status}, ${r.mitigation})
        on conflict do nothing
      `);
      inserted++;
    }

    // Sample tickets
    const tickets = [
      { title: "Configure compensation module", status: "new", priority: "high", assignee: "Config Team" },
      { title: "Test benefits enrollment flow", status: "in_progress", priority: "medium", assignee: "QA Lead" },
      { title: "Document custom reports", status: "done", priority: "low", assignee: "Documentation Team" }
    ];
    for (const t of tickets) {
      await db.execute(sql`
        insert into tickets (project_id, source, title, status, priority, assignee)
        values (${projectId}, 'manual', ${t.title}, ${t.status}, ${t.priority}, ${t.assignee})
        on conflict do nothing
      `);
      inserted++;
    }

    // Sample meetings
    await db.execute(sql`
      insert into meetings (project_id, title, date, attendees)
      values
        (${projectId}, 'Sprint Planning - Week 12', now() + interval '3 days', '["PM","Tech Lead","Business Analyst"]'::jsonb),
        (${projectId}, 'Stakeholder Review', now() + interval '7 days', '["Exec Sponsor","PM","Delivery Manager"]'::jsonb)
      on conflict do nothing
    `);
    inserted += 2;

    res.json({ ok: true, inserted, message: "Rich demo dataset created" });
  } catch (e) { next(e); }
});
