import { db } from "../db/client";
import { sql } from "drizzle-orm";
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const POLL_MS = Number(process.env.PARSE_POLL_MS || 7000);
const MAX_ATTEMPTS = 3;
const MAX_CHARS = Number(process.env.INSIGHTS_MAX_CHARS || 20000);

const SCHEMA_ERROR_CODES = new Set(["42P01", "42P10"]);
let loggedSchemaError = false;

function getPgErrorCode(error: any): string | undefined {
  return error?.code ?? error?.original?.code ?? error?.cause?.code;
}

function handleSchemaError(context: string, error: any): boolean {
  const code = getPgErrorCode(error);
  if (code && SCHEMA_ERROR_CODES.has(code)) {
    if (!loggedSchemaError) {
      console.warn(`${context} database not ready (${code}): ${error?.message ?? error}`);
      loggedSchemaError = true;
    }
    return true;
  }
  return false;
}

async function beat(name: string, info: any = {}) {
  if (process.env.WORKERS_ENABLED === "0") {
    return;
  }
  try {
    const infoJson = JSON.stringify(info);
    await db.execute(sql`
      INSERT INTO worker_heartbeat (worker, info, updated_at)
      VALUES (${name}, ${infoJson}::jsonb, now())
      ON CONFLICT (worker) DO UPDATE SET info=${infoJson}::jsonb, updated_at=now()
    `);
  } catch (e) {
    if (!handleSchemaError("[parseWorker]", e)) {
      console.error("[parseWorker] beat failed", e);
    }
  }
}

async function nextJob() {
  const result: any = await db.execute(sql`
    WITH next_job AS (
      SELECT id, doc_id, project_id
      FROM parse_jobs
      WHERE status = 'pending'
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE parse_jobs
    SET status = 'running', attempts = attempts + 1, updated_at = NOW()
    FROM next_job
    WHERE parse_jobs.id = next_job.id
    RETURNING parse_jobs.id, parse_jobs.doc_id as "docId", parse_jobs.project_id as "projectId"
  `);
  
  const rows = result.rows || result;
  return rows.length > 0 ? rows[0] : null;
}

const SYS = `You are an expert Workday/M&A integration analyst. Extract structured data from the given document text.
Return strict JSON with keys: timeline (array), actions (array), decisions (array), tests (array), ma (object).
Schema:
timeline[]: { title, type, startsAt, endsAt?, confidence, source }
actions[]:  { title, assignee?, dueAt?, priority?, status?, confidence, source }
decisions[]:{ decision, decidedBy?, decidedAt?, rationale?, confidence, source }
tests[]:    { title, steps[], expected, priority?, tags[], confidence, source }
ma: {
  risks: [{ title, description, probability (0-100), impact (1-5), owner?, mitigation?, dueAt?, tags[] }],
  integrations: [{ name, sourceSystem, targetSystem, status?, dependsOn[] }],
  stakeholders: [{ name, email?, org?, role?, raci? }],
  lessons: [{ title, category?, whatHappened, recommendation, tags[] }]
}
Dates must be ISO 8601 (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ). Confidence 0..1 string ok.
If unsure, prefer empty arrays. Keep source to a short excerpt (<260 chars) from the text.
`;

async function extractInsights(text: string) {
  const input = text.slice(0, MAX_CHARS);
  const resp = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: [
      { role: "system", content: SYS },
      { role: "user", content: input }
    ],
    response_format: { type: "json_object" }
  });
  const raw = resp.choices[0]?.message?.content || "{}";
  let data: any = {};
  try { data = JSON.parse(raw); } catch { data = {}; }
  return {
    timeline: Array.isArray(data.timeline) ? data.timeline : [],
    actions: Array.isArray(data.actions) ? data.actions : [],
    decisions: Array.isArray(data.decisions) ? data.decisions : [],
    tests: Array.isArray(data.tests) ? data.tests : [],
    ma: data.ma || {}
  };
}

async function processJob(job: any) {
  const result: any = await db.execute(sql`SELECT full_text as "fullText" FROM docs WHERE id = ${job.docId}`);
  const rows = result.rows || result;
  const doc = rows?.[0];
  if (!doc) throw new Error("doc not found");
  const text = doc.fullText || "";
  if (!text.trim()) {
    await db.execute(sql`UPDATE parse_jobs SET status='done', updated_at=now() WHERE id = ${job.id}`);
    return;
  }

  const out = await extractInsights(text);

  // Insert timeline events (with upsert to handle duplicates)
  // Note: We insert each event individually to handle conflicts. The unique index
  // timeline_events_uq prevents duplicates based on (project_id, title, COALESCE(starts_at, created_at))
  for (const e of out.timeline) {
    try {
      await db.execute(sql`
        INSERT INTO timeline_events (project_id, doc_id, title, type, starts_at, ends_at, confidence, source, origin_type, origin_id)
        VALUES (${job.projectId}, ${job.docId}, ${e.title ?? ""}, ${e.type ?? "milestone"}, ${e.startsAt ?? null}, ${e.endsAt ?? null}, ${e.confidence ?? "0.7"}, ${e.source ?? null}, 'doc', ${job.docId})
      `);
    } catch (err: any) {
      // If duplicate key error (23505), skip silently as the event already exists
      if (err.code === '23505') {
        console.log(`[parseWorker] Skipping duplicate timeline event: ${e.title}`);
      } else {
        throw err;
      }
    }
  }

  // Insert actions
  for (const a of out.actions) {
    await db.execute(sql`
      INSERT INTO actions_extracted (project_id, doc_id, title, assignee, due_at, priority, status, confidence, source, origin_type, origin_id)
      VALUES (${job.projectId}, ${job.docId}, ${a.title ?? ""}, ${a.assignee ?? null}, ${a.dueAt ?? null}, ${a.priority ?? "normal"}, ${a.status ?? "open"}, ${a.confidence ?? "0.7"}, ${a.source ?? null}, 'doc', ${job.docId})
    `);
  }

  // Insert decisions
  for (const d of out.decisions) {
    await db.execute(sql`
      INSERT INTO decisions_extracted (project_id, doc_id, decision, decided_by, decided_at, rationale, confidence, source, origin_type, origin_id)
      VALUES (${job.projectId}, ${job.docId}, ${d.decision ?? ""}, ${d.decidedBy ?? null}, ${d.decidedAt ?? null}, ${d.rationale ?? null}, ${d.confidence ?? "0.7"}, ${d.source ?? null}, 'doc', ${job.docId})
    `);
  }

  // Insert test cases
  for (const t of out.tests) {
    await db.execute(sql`
      INSERT INTO test_cases (project_id, doc_id, title, steps, expected, priority, tags, confidence, source)
      VALUES (${job.projectId}, ${job.docId}, ${t.title ?? ""}, ${JSON.stringify(t.steps ?? [])}, ${t.expected ?? null}, ${t.priority ?? "P3"}, ${JSON.stringify(t.tags ?? [])}, ${t.confidence ?? "0.7"}, ${t.source ?? null})
    `);
  }

  // M&A extras
  const M = out.ma || {};
  
  // Insert risks
  for (const r of (M.risks || [])) {
    const sev = Math.round(((Number(r.probability || 50) / 100) * Number(r.impact || 2)) * 10);
    await db.execute(sql`
      INSERT INTO risks (org_id, project_id, source_doc_id, title, description, probability, impact, severity_score, owner, mitigation, due_at, tags, origin_type, origin_id)
      SELECT org_id, ${job.projectId}, ${job.docId}, ${r.title || ""}, ${r.description || ""}, ${r.probability || 50}, ${r.impact || 2}, ${sev}, ${r.owner || null}, ${r.mitigation || null}, ${r.dueAt || null}, ${JSON.stringify(r.tags || [])}, 'doc', ${job.docId}
      FROM projects WHERE id = ${job.projectId}
    `);
  }
  
  // Insert integrations
  for (const it of (M.integrations || [])) {
    await db.execute(sql`
      INSERT INTO integrations (project_id, name, source_system, target_system, status, depends_on)
      VALUES (${job.projectId}, ${it.name || ""}, ${it.sourceSystem || ""}, ${it.targetSystem || ""}, ${it.status || "planned"}, ${JSON.stringify(it.dependsOn || [])})
      ON CONFLICT DO NOTHING
    `);
  }
  
  // Insert stakeholders
  for (const s of (M.stakeholders || [])) {
    await db.execute(sql`
      INSERT INTO stakeholders (project_id, name, email, org, role, raci)
      VALUES (${job.projectId}, ${s.name || ""}, ${s.email || null}, ${s.org || null}, ${s.role || null}, ${s.raci || null})
      ON CONFLICT DO NOTHING
    `);
  }
  
  // Insert lessons learned
  for (const l of (M.lessons || [])) {
    await db.execute(sql`
      INSERT INTO lessons (project_id, doc_id, title, category, what_happened, recommendation, tags)
      VALUES (${job.projectId}, ${job.docId}, ${l.title || ""}, ${l.category || null}, ${l.whatHappened || ""}, ${l.recommendation || ""}, ${JSON.stringify(l.tags || [])})
    `);
  }

  await db.execute(sql`UPDATE docs SET parsed_at = now() WHERE id = ${job.docId}`);
  await db.execute(sql`UPDATE parse_jobs SET status='done', updated_at=now() WHERE id = ${job.id}`);
}

export function startParseWorker() {
  if (process.env.WORKERS_ENABLED === "0") {
    console.log("[parseWorker] disabled (WORKERS_ENABLED=0)");
    return;
  }
  if (process.env.PARSE_WORKER === "0") {
    console.log("[parseWorker] disabled (PARSE_WORKER=0)");
    return;
  }

  console.log(`[parseWorker] starting with ${POLL_MS}ms poll interval`);
  const tick = async () => {
    if (process.env.WORKERS_ENABLED === "0") {
      return;
    }
    try {
      const job = await nextJob();
      if (!job) {
        const countResult: any = await db.execute(sql`select count(*)::int as n from parse_jobs where status='pending'`);
        const pending = (countResult.rows || countResult)?.[0]?.n || 0;
        await beat("parse", { pending });
        loggedSchemaError = false;
        return;
      }

      console.log(`[parseWorker] Processing job ${job.id} for doc ${job.docId}`);

      try {
        await processJob(job);
        console.log(`[parseWorker] Completed job ${job.id}`);
      }
      catch (err: any) {
        if (handleSchemaError("[parseWorker]", err)) {
          return;
        }
        console.error("[parseWorker] failed", err?.message);
        await db.execute(sql`
          UPDATE parse_jobs
          SET status = CASE WHEN attempts >= ${MAX_ATTEMPTS} THEN 'failed' ELSE 'pending' END,
              last_error = ${String(err?.message || err)}, updated_at = now()
          WHERE id = ${job.id}
        `);
      }

      const countResult: any = await db.execute(sql`select count(*)::int as n from parse_jobs where status='pending'`);
      const pending = (countResult.rows || countResult)?.[0]?.n || 0;
      await beat("parse", { pending });
      loggedSchemaError = false;
    } catch (e) {
      if (!handleSchemaError("[parseWorker]", e)) {
        console.error("[parseWorker] tick error", e);
      }
    }
  };

  setInterval(tick, POLL_MS);
  void tick();
}
