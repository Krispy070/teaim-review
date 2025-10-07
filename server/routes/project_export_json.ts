import { Router } from "express";
import { requireProject } from "../auth/projectAccess";
import { db } from "../db/client";
import { sql } from "drizzle-orm";

export const pexportJson = Router();

/** GET /api/projects/export.json?projectId=... */
pexportJson.get("/export.json", requireProject("member"), async (req, res, next) => {
  try {
    const pid = String(req.query.projectId || "");
    if (!pid) return res.status(400).json({ error: "projectId required" });

    const projectResult = await db.execute(sql`
      select id, name, code, created_at as "createdAt" from projects where id=${pid}
    `);
    const project = (projectResult.rows as any)?.[0];

    const projectSettingsResult = await db.execute(sql`
      select project_id as "projectId",
              pii_mode as "piiMode", allow_email_domains as "allowEmailDomains",
              allow_original_preview as "allowOriginalPreview",
              created_at as "createdAt", updated_at as "updatedAt"
         from project_settings where project_id=${pid}
    `);
    const projectSettings = projectSettingsResult.rows || [];

    const docsResult = await db.execute(sql`
      select id, name, mime, size_bytes as "sizeBytes",
              full_text as "fullText", summary, keywords, meta, has_pii as "hasPii",
              created_at as "createdAt", updated_at as "updatedAt"
         from docs where project_id=${pid} and deleted_at is null
    `);
    const docs = (docsResult.rows || []).map((d: any) => ({
      ...d,
      fullText: d.fullText ? "[REDACTED - will be re-extracted on import]" : null
    }));

    const releasesResult = await db.execute(sql`
      select id, title, description, starts_at as "startsAt", created_at as "createdAt"
         from releases where project_id=${pid}
    `);
    const releases = releasesResult.rows || [];

    const cadencesResult = await db.execute(sql`
      select id, name, frequency, dow as "dayOfWeek", time_utc as "timeUtc", attendees, created_at as "createdAt"
         from cadences where project_id=${pid}
    `);
    const cadences = cadencesResult.rows || [];

    const playbooksResult = await db.execute(sql`
      select id, template_id as "templateId", name, status, params, sections, progress_pct as "progressPct",
              created_at as "createdAt", updated_at as "updatedAt"
         from playbooks where project_id=${pid}
    `);
    const playbooks = playbooksResult.rows || [];

    const playbookItemsResult = await db.execute(sql`
      select id, playbook_id as "playbookId", section, idx, title, description, owner_role as "ownerRole",
              due_at as "dueAt", tags, status, action_id as "actionId",
              created_at as "createdAt", updated_at as "updatedAt"
         from playbook_items where project_id=${pid}
    `);
    const playbookItems = playbookItemsResult.rows || [];

    const integrationsResult = await db.execute(sql`
      select id, name, source_system as "sourceSystem", target_system as "targetSystem", status,
              owner, environment, test_status as "testStatus",
              cutover_start as "cutoverStart", cutover_end as "cutoverEnd",
              runbook_url as "runbookUrl", notes, depends_on as "dependsOn",
              created_at as "createdAt", updated_at as "updatedAt"
         from integrations where project_id=${pid}
    `);
    const integrations = integrationsResult.rows || [];

    const integrationTestsResult = await db.execute(sql`
      select id, integration_id as "integrationId", environment, status, executed_at as "executedAt", notes, link, created_at as "createdAt"
         from integration_tests where project_id=${pid}
    `);
    const integrationTests = integrationTestsResult.rows || [];

    const risksResult = await db.execute(sql`
      select id, title, description, probability, impact, severity, owner, mitigation, status,
              due_at as "dueAt", tags, created_at as "createdAt", updated_at as "updatedAt"
         from risks where project_id=${pid}
    `);
    const risks = risksResult.rows || [];

    const stakeholdersResult = await db.execute(sql`
      select id, name, email, org, role, raci, meta, created_at as "createdAt"
         from stakeholders where project_id=${pid}
    `);
    const stakeholders = stakeholdersResult.rows || [];

    const lessonsResult = await db.execute(sql`
      select id, doc_id as "docId", title, category, what_happened as "whatHappened",
              recommendation, tags, created_at as "createdAt"
         from lessons where project_id=${pid}
    `);
    const lessons = lessonsResult.rows || [];

    const trainingResult = await db.execute(sql`
      select id, module, workstream, phase, topic, delivery, hours, audience, owner, status,
              start_at as "startAt", end_at as "endAt", location_url as "locationUrl", prereqs, resources_url as "resourcesUrl", notes,
              reminded_24 as "reminded24", reminded_1 as "reminded1", created_at as "createdAt"
         from training_plan where project_id=${pid}
    `);
    const training = trainingResult.rows || [];

    const timelineResult = await db.execute(sql`
      select id, title, type, starts_at as "startsAt", ends_at as "endsAt", confidence,
              doc_id as "docId", created_at as "createdAt"
         from timeline_events where project_id=${pid}
    `);
    const timeline = timelineResult.rows || [];

    const actionsResult = await db.execute(sql`
      select id, title, description, owner, verb, due_date as "dueDate", status,
              extracted_from as "extractedFrom", created_at as "createdAt"
         from actions where project_id=${pid}
    `);
    const actions = actionsResult.rows || [];

    let decisions:any[] = [];
    try {
      const decisionsResult = await db.execute(sql`
        select id, decision, decided_by as "decidedBy", decided_at as "decidedAt", rationale,
                confidence, source, doc_id as "docId", created_at as "createdAt"
           from decisions where project_id=${pid}
      `);
      decisions = decisionsResult.rows || [];
    } catch {}

    const snapshot = {
      version: 1,
      exportedAt: new Date().toISOString(),
      project,
      projectSettings,
      data: {
        docs, releases, cadences, playbooks, playbookItems,
        integrations, integrationTests, risks, stakeholders, lessons,
        training, timeline, actions, decisions
      }
    };

    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="teaim_project_${pid}.json"`);
    res.send(JSON.stringify(snapshot, null, 2));
  } catch (e) {
    next(e);
  }
});
