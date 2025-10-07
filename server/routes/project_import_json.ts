import { Router } from "express";
import multer from "multer";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import crypto from "node:crypto";
import { requireRole } from "../auth/supabaseAuth";

export const pimportJson = Router();
const upload = multer();

const newid = () => crypto.randomUUID();

/**
 * POST /api/projects/import
 * Form-data:
 *   - file: JSON snapshot
 *   - targetProjectId?  (import into this project)
 *   - createNew? (json: { name, code })  -> creates project and uses new id
 *   - remapIds? default true (recommended)
 *   - requeue? default true (queue embed/parse for docs)
 */
pimportJson.post("/import", requireRole("admin"), upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error:"file required" });
    const body = req.body || {};
    const remapIds = body.remapIds !== "false";
    const requeue = body.requeue !== "false";

    const snapshot = JSON.parse(req.file.buffer.toString("utf8"));
    const src = snapshot?.data || {};
    if (!src) return res.status(400).json({ error:"bad snapshot" });

    let projectId = String(body.targetProjectId||"");
    if (!projectId && body.createNew) {
      const spec = JSON.parse(body.createNew);
      const result = await db.execute(sql`
        insert into projects (name, code) values (${spec.name}, ${spec.code}) returning id
      `);
      projectId = (result.rows as any)?.[0]?.id;
    }
    if (!projectId) return res.status(400).json({ error:"targetProjectId or createNew required" });

    const map = {
      doc: new Map<string,string>(),
      rel: new Map<string,string>(),
      cad: new Map<string,string>(),
      pbk: new Map<string,string>(),
      pbi: new Map<string,string>(),
      int: new Map<string,string>(),
      itest: new Map<string,string>(),
      risk: new Map<string,string>(),
      stk: new Map<string,string>(),
      les: new Map<string,string>(),
      act: new Map<string,string>(),
      tim: new Map<string,string>(),
      dec: new Map<string,string>(),
    };

    if (snapshot.projectSettings?.length) {
      const s = snapshot.projectSettings[0];
      const allowEmailDomainsJson = JSON.stringify(s.allowEmailDomains||[]);
      await db.execute(sql`
        insert into project_settings (project_id, pii_mode, allow_email_domains, allow_original_preview)
         values (${projectId}, ${s.piiMode||"strict"}, ${allowEmailDomainsJson}, ${!!s.allowOriginalPreview})
         on conflict (project_id) do update set
           pii_mode=excluded.pii_mode, allow_email_domains=excluded.allow_email_domains,
           allow_original_preview=excluded.allow_original_preview, updated_at=now()
      `);
    }

    if (src.docs?.length) {
      for (const d of src.docs) {
        const id = remapIds ? newid() : d.id;
        map.doc.set(d.id, id);
        const keywordsJson = JSON.stringify(d.keywords||[]);
        const metaJson = JSON.stringify(d.meta||{});
        await db.execute(sql`
          insert into docs (id, project_id, name, mime, size_bytes, full_text, summary, keywords, meta, has_pii, created_at, updated_at)
           values (${id}, ${projectId}, ${d.name}, ${d.mime}, ${d.sizeBytes||"0"}, null, ${d.summary||null}, ${keywordsJson}, ${metaJson}, ${!!d.hasPii}, now(), now())
        `);
        if (requeue) {
          await db.execute(sql`insert into embed_jobs (doc_id, project_id, status) values (${id}, ${projectId}, 'pending') on conflict do nothing`);
          await db.execute(sql`insert into parse_jobs (doc_id, project_id, status) values (${id}, ${projectId}, 'pending') on conflict do nothing`);
        }
      }
    }

    if (src.releases?.length) {
      for (const r of src.releases) {
        const id = remapIds ? newid() : r.id; map.rel.set(r.id, id);
        await db.execute(sql`
          insert into releases (id, project_id, title, description, starts_at, created_at)
           values (${id}, ${projectId}, ${r.title}, ${r.description||null}, ${r.startsAt||null}, now())
        `);
      }
    }

    if (src.cadences?.length) {
      for (const c of src.cadences) {
        const id = remapIds ? newid() : c.id; map.cad.set(c.id, id);
        const attendeesJson = JSON.stringify(c.attendees||[]);
        await db.execute(sql`
          insert into cadences (id, project_id, name, frequency, dow, time_utc, attendees, created_at)
           values (${id}, ${projectId}, ${c.name}, ${c.frequency||"weekly"}, ${c.dayOfWeek||3}, ${c.timeUtc||"17:00"}, ${attendeesJson}, now())
        `);
      }
    }

    if (src.playbooks?.length) {
      for (const p of src.playbooks) {
        const id = remapIds ? newid() : p.id; map.pbk.set(p.id, id);
        const paramsJson = JSON.stringify(p.params||{});
        const sectionsJson = JSON.stringify(p.sections||[]);
        await db.execute(sql`
          insert into playbooks (id, project_id, template_id, name, status, params, sections, progress_pct, created_at, updated_at)
           values (${id}, ${projectId}, ${p.templateId||null}, ${p.name}, ${p.status||"active"}, ${paramsJson}, ${sectionsJson}, ${p.progressPct||0}, now(), now())
        `);
      }
    }
    if (src.playbookItems?.length) {
      for (const it of src.playbookItems) {
        const id = remapIds ? newid() : it.id; map.pbi.set(it.id, id);
        const pbid = map.pbk.get(it.playbookId) || it.playbookId;
        const tagsJson = JSON.stringify(it.tags||[]);
        await db.execute(sql`
          insert into playbook_items (id, project_id, playbook_id, section, idx, title, description, owner_role, due_at, tags, status, action_id, created_at, updated_at)
           values (${id}, ${projectId}, ${pbid}, ${it.section||null}, ${it.idx||0}, ${it.title}, ${it.description||null}, ${it.ownerRole||null}, ${it.dueAt||null}, ${tagsJson}, ${it.status||"open"}, ${null}, now(), now())
        `);
      }
    }

    if (src.integrations?.length) {
      for (const i of src.integrations) {
        const id = remapIds ? newid() : i.id; map.int.set(i.id, id);
        const dependsOnJson = JSON.stringify(i.dependsOn||[]);
        await db.execute(sql`
          insert into integrations (id, project_id, name, source_system, target_system, status, owner, environment, test_status, cutover_start, cutover_end, runbook_url, notes, depends_on, created_at, updated_at)
           values (${id}, ${projectId}, ${i.name}, ${i.sourceSystem}, ${i.targetSystem}, ${i.status||"planned"}, ${i.owner||null}, ${i.environment||null}, ${i.testStatus||null}, ${i.cutoverStart||null}, ${i.cutoverEnd||null}, ${i.runbookUrl||null}, ${i.notes||null}, ${dependsOnJson}, now(), now())
        `);
      }
      if (remapIds) {
        const all = await db.execute(sql`select id, depends_on from integrations where project_id=${projectId}`);
        for (const r of ((all.rows as any)||[])) {
          const mapped = (r.depends_on||[]).map((old:string)=> map.int.get(old) || old);
          const mappedJson = JSON.stringify(mapped);
          await db.execute(sql`update integrations set depends_on=${mappedJson} where id=${r.id}`);
        }
      }
    }
    if (src.integrationTests?.length) {
      for (const t of src.integrationTests) {
        const id = remapIds ? newid() : t.id;
        const integId = map.int.get(t.integrationId) || t.integrationId;
        await db.execute(sql`
          insert into integration_tests (id, project_id, integration_id, environment, status, executed_at, notes, link, created_at)
           values (${id}, ${projectId}, ${integId}, ${t.environment||"test"}, ${t.status||"in_progress"}, ${t.executedAt||null}, ${t.notes||null}, ${t.link||null}, now())
        `);
      }
    }

    if (src.risks?.length) {
      for (const r of src.risks) {
        const id = remapIds ? newid() : r.id; map.risk.set(r.id, id);
        const tagsJson = JSON.stringify(r.tags||[]);
        await db.execute(sql`
          insert into risks (id, project_id, title, description, probability, impact, severity, owner, mitigation, status, due_at, tags, created_at, updated_at)
           values (${id}, ${projectId}, ${r.title}, ${r.description||null}, ${r.probability||50}, ${r.impact||2}, ${r.severity||0}, ${r.owner||null}, ${r.mitigation||null}, ${r.status||"open"}, ${r.dueAt||null}, ${tagsJson}, now(), now())
        `);
      }
    }

    if (src.stakeholders?.length) {
      for (const s of src.stakeholders) {
        const id = remapIds ? newid() : s.id;
        const metaJson = JSON.stringify(s.meta||{});
        await db.execute(sql`
          insert into stakeholders (id, project_id, name, email, org, role, raci, meta, created_at)
           values (${id}, ${projectId}, ${s.name}, ${s.email||null}, ${s.org||null}, ${s.role||null}, ${s.raci||null}, ${metaJson}, now())
        `);
      }
    }

    if (src.lessons?.length) {
      for (const l of src.lessons) {
        const id = remapIds ? newid() : l.id;
        const docId = l.docId ? (map.doc.get(l.docId) || l.docId) : null;
        const tagsJson = JSON.stringify(l.tags||[]);
        await db.execute(sql`
          insert into lessons (id, project_id, doc_id, title, category, what_happened, recommendation, tags, created_at)
           values (${id}, ${projectId}, ${docId}, ${l.title}, ${l.category||null}, ${l.whatHappened||""}, ${l.recommendation||""}, ${tagsJson}, now())
        `);
      }
    }

    if (src.training?.length) {
      for (const t of src.training) {
        const id = remapIds ? newid() : t.id;
        const metaJson = JSON.stringify(t.meta||{});
        await db.execute(sql`
          insert into training_plan (id, project_id, module, workstream, phase, topic, delivery, hours, audience, owner, status, start_at, end_at, location_url, prereqs, resources_url, notes, source_sheet, meta, reminded_24, reminded_1, created_at, updated_at)
           values (${id}, ${projectId}, ${t.module||null}, ${t.workstream||null}, ${t.phase||null}, ${t.topic}, ${t.delivery||null}, ${t.hours||0}, ${t.audience||null}, ${t.owner||null}, ${t.status||"planned"}, ${t.startAt||null}, ${t.endAt||null}, ${t.locationUrl||null}, ${t.prereqs||null}, ${t.resourcesUrl||null}, ${t.notes||null}, ${t.sourceSheet||null}, ${metaJson}, ${!!t.reminded24}, ${!!t.reminded1}, now(), now())
        `);
      }
    }

    if (src.timeline?.length) {
      for (const e of src.timeline) {
        const id = remapIds ? newid() : e.id; map.tim.set(e.id, id);
        const docId = e.docId ? (map.doc.get(e.docId) || e.docId) : null;
        await db.execute(sql`
          insert into timeline_events (id, project_id, title, type, starts_at, ends_at, confidence, doc_id, created_at)
           values (${id}, ${projectId}, ${e.title}, ${e.type||"milestone"}, ${e.startsAt||null}, ${e.endsAt||null}, ${e.confidence||"0.7"}, ${docId}, now())
        `);
      }
    }

    if (src.actions?.length) {
      for (const a of src.actions) {
        const id = remapIds ? newid() : a.id; map.act.set(a.id, id);
        const docId = a.docId ? (map.doc.get(a.docId) || a.docId) : null;
        await db.execute(sql`
          insert into actions (id, project_id, title, assignee, due_at, priority, status, source, doc_id, created_at, updated_at)
           values (${id}, ${projectId}, ${a.title}, ${a.assignee||null}, ${a.dueAt||null}, ${a.priority||"normal"}, ${a.status||"open"}, ${a.source||null}, ${docId}, now(), now())
        `);
      }
    }

    if (src.decisions?.length) {
      for (const d of src.decisions) {
        const id = remapIds ? newid() : d.id;
        const docId = d.docId ? (map.doc.get(d.docId) || d.docId) : null;
        try {
          await db.execute(sql`
            insert into decisions (id, project_id, decision, decided_by, decided_at, rationale, confidence, source, doc_id, created_at)
             values (${id}, ${projectId}, ${d.decision}, ${d.decidedBy||null}, ${d.decidedAt||null}, ${d.rationale||null}, ${d.confidence||"0.7"}, ${d.source||null}, ${docId}, now())
          `);
        } catch {}
      }
    }

    res.json({ ok:true, projectId, counts: {
      docs: src.docs?.length||0, releases: src.releases?.length||0, cadences: src.cadences?.length||0,
      playbooks: src.playbooks?.length||0, playbookItems: src.playbookItems?.length||0,
      integrations: src.integrations?.length||0, integrationTests: src.integrationTests?.length||0,
      risks: src.risks?.length||0, stakeholders: src.stakeholders?.length||0, lessons: src.lessons?.length||0,
      training: src.training?.length||0, timeline: src.timeline?.length||0, actions: src.actions?.length||0, decisions: src.decisions?.length||0
    }});
  } catch (e:any) {
    res.status(500).json({ error:String(e?.message||e) });
  }
});
