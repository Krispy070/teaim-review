import { Router } from "express";
import archiver from "archiver";
import { db, pool } from "../db/client";
import { requireProject } from "../auth/projectAccess";

export const pexportFull = Router();

async function snapshot(projectId:string) {
  const q = async (sql:string, p:any[] = []) => (await pool.query(sql, p)).rows || [];
  const project = (await q(`select id, name, code, created_at as "createdAt" from projects where id=$1`, [projectId]))[0];
  const settings = await q(
    `select project_code as "projectCode", pii_mode as "piiMode", allow_email_domains as "allowEmailDomains",
            allow_original_preview as "allowOriginalPreview", artifact_retention_days as "artifactRetentionDays",
            artifact_max_gb as "artifactMaxGB"
       from project_settings where project_id=$1`, [projectId]
  );
  const docs   = await q(`select id, name, mime, size_bytes as "sizeBytes", full_text as "fullText", summary, keywords, meta, has_pii as "hasPII", created_at as "createdAt" from docs where project_id=$1 and deleted_at is null`, [projectId]);
  const actions= await q(`select id, title, assignee, due_at as "dueAt", priority, status, source, doc_id as "docId", created_at as "createdAt" from actions where project_id=$1`, [projectId]);
  const timeline=await q(`select id, title, type, starts_at as "startsAt", ends_at as "endsAt", confidence, doc_id as "docId", created_at as "createdAt" from timeline_events where project_id=$1`, [projectId]);
  const decisions = await q(`select id, decision, decided_by as "decidedBy", decided_at as "decidedAt", rationale, confidence, source, doc_id as "docId", created_at as "createdAt" from decisions where project_id=$1`, [projectId]).catch(()=>[]);
  const risks  = await q(`select id, title, description, probability, impact, severity, owner, mitigation, status, due_at as "dueAt", tags, created_at as "createdAt" from risks where project_id=$1`, [projectId]);
  const releases = await q(`select id, title, description, starts_at as "startsAt" from releases where project_id=$1`, [projectId]);
  const cadences = await q(`select id, name, frequency, dow as "dayOfWeek", time_utc as "timeUTC", attendees from cadences where project_id=$1`, [projectId]);
  const playbooks = await q(`select id, template_id as "templateId", name, status, params, sections, progress_pct as "progressPct", created_at as "createdAt" from playbooks where project_id=$1`, [projectId]);
  const playbookItems = await q(`select id, playbook_id as "playbookId", section, idx, title, description, owner_role as "ownerRole", due_at as "dueAt", tags, status, action_id as "actionId", created_at as "createdAt" from playbook_items where project_id=$1`, [projectId]);
  const integrations= await q(`select id, name, source_system as "sourceSystem", target_system as "targetSystem", status, owner, environment, test_status as "testStatus", depends_on as "dependsOn", runbook_url as "runbookUrl", notes, adapter_type as "adapterType", adapter_config as "adapterConfig", schedule_cron as "scheduleCron", timezone, sla_target as "slaTarget", created_at as "createdAt" from integrations where project_id=$1`, [projectId]);
  const itests = await q(`select id, integration_id as "integrationId", environment, status, executed_at as "executedAt", notes, link from integration_tests where project_id=$1`, [projectId]);
  const meetings = await q(`select id, title, starts_at as "startsAt", ends_at as "endsAt", location, link, attendees, source, transcript_text as "transcriptText", summary, insights, created_at as "createdAt" from meetings where project_id=$1`, [projectId]);
  const stakeholders= await q(`select id, name, email, org, role, raci, tags, workstreams, modules, created_at as "createdAt" from stakeholders where project_id=$1`, [projectId]);
  const lessons= await q(`select id, doc_id as "docId", title, category, what_happened as "whatHappened", recommendation, tags, created_at as "createdAt" from lessons where project_id=$1`, [projectId]);
  const conversations = await q(`select id, source, source_ref as "sourceRef", title, created_by as "createdBy", created_at as "createdAt" from conversations where project_id=$1`, [projectId]);
  const convMsgs = await q(`select conversation_id as "conversationId", author, text, at, meta from conversation_messages where project_id=$1 order by at asc`, [projectId]);

  return {
    version: 3,
    exportedAt: new Date().toISOString(),
    project, settings,
    data: { docs, actions, timeline, decisions, risks, releases, cadences, playbooks, playbookItems, integrations, itests, meetings, stakeholders, lessons, conversations, convMsgs }
  };
}

/** GET /api/projects/export_full.zip?projectId=&maxFileMB=25&include=artifacts,specs,tickets */
pexportFull.get("/export_full.zip", requireProject("member"), async (req, res, next) => {
  try {
    const projectId = String(req.query.projectId||"").trim();
    if (!projectId) return res.status(400).json({ error:"projectId required" });
    const maxMB = Number(req.query.maxFileMB || 25);
    const include = String(req.query.include||"artifacts,specs,tickets")
      .split(",").map(s=>s.trim().toLowerCase()).filter(Boolean);
    const maxBytes = maxMB > 0 ? maxMB * 1024 * 1024 : Infinity;

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="teaim_full_${projectId}.zip"`);

    const arc = archiver("zip", { zlib:{ level:9 } });
    arc.on("error", next);
    arc.pipe(res);

    // 1) snapshot.json
    arc.append(JSON.stringify(await snapshot(projectId), null, 2), { name: "snapshot.json" });

    // 2) CSV folders quick wins (docs/actions/integrations)
    const esc = (s:any)=>`"${String(s??"").replace(/"/g,'""')}"`;
    const rows = async (sql:string, p:any[]) => (await pool.query(sql, p)).rows || [];
    const docs = await rows(`select id, name, mime, size_bytes, created_at from docs where project_id=$1 and deleted_at is null`, [projectId]);
    const actions = await rows(`select id, title, assignee, due_at, priority, status, created_at from actions where project_id=$1`, [projectId]);
    const ints = await rows(`select id, name, source_system, target_system, status, owner, environment, created_at from integrations where project_id=$1`, [projectId]);

    arc.append(["id,name,mime,size_bytes,created_at", ...docs.map((d:any)=>[d.id,d.name,d.mime,d.size_bytes,d.created_at].map(esc).join(","))].join("\r\n"), { name:"csv/docs.csv" });
    arc.append(["id,title,assignee,due_at,priority,status,created_at", ...actions.map((a:any)=>[a.id,a.title,a.assignee||"",a.due_at||"",a.priority||"",a.status||"",a.created_at].map(esc).join(","))].join("\r\n"), { name:"csv/actions.csv" });
    arc.append(["id,name,source_system,target_system,status,owner,environment,created_at", ...ints.map((i:any)=>[i.id,i.name,i.source_system,i.target_system,i.status,i.owner||"",i.environment||"",i.created_at].map(esc).join(","))].join("\r\n"), { name:"csv/integrations.csv" });

    // 3) binaries: artifacts/specs/ticket attachments with size cutoff
    if (include.includes("artifacts")) {
      const arts = await rows(
        `select a.id, a.name, a.storage_path as "p", coalesce(a.size_bytes,0) as "s", r.id as "runId"
           from integration_run_artifacts a
      left join integration_runs r on r.id = a.run_id
          where a.project_id=$1 and a.storage_path is not null
          order by a.created_at desc`, [projectId]
      );
      for (const a of arts) { if (a.s <= maxBytes) arc.file(a.p, { name: `artifacts/${a.runId || "run"}/${a.name}` }); }
    }
    if (include.includes("specs")) {
      const specs = await rows(
        `select id, name, storage_path as "p" from integration_specs where project_id=$1 and storage_path is not null order by created_at desc`, [projectId]
      );
      for (const s of specs) arc.file(s.p, { name: `specs/${s.name}` });
    }
    if (include.includes("tickets")) {
      const tAtt = await rows(
        `select ta.id, ta.name, ta.storage_path as "p", tm.ticket_id as "ticketId"
           from ticket_attachments ta
      left join ticket_messages tm on tm.id = ta.message_id
          where ta.project_id=$1 and ta.storage_path is not null
          order by ta.created_at desc`, [projectId]
      );
      for (const t of tAtt) arc.file(t.p, { name: `tickets/${t.ticketId || "ticket"}/${t.name}` });
    }

    // 4) manifest.json (what we included)
    arc.append(JSON.stringify({ projectId, maxFileMB: isFinite(maxBytes) ? maxMB : null, include }, null, 2), { name: "manifest.json" });

    await arc.finalize();
  } catch (e) { next(e); }
});
