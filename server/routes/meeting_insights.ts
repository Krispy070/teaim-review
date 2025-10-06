import { Router } from "express";
import { db } from "../db/client";
import OpenAI from "openai";
import { requireProject } from "../auth/projectAccess";
import { sql } from "drizzle-orm";

export const mins = Router();
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYS = `You are an expert PM meeting analyst. Summarize the meeting and extract:
- actions[]: { title, assignee?, dueAt? }
- decisions[]: { decision, decidedBy?, decidedAt? }
- risks[]: { title, severity(1-5), owner?, mitigation? }
Return strict JSON: {"summary":"...", "actions":[], "decisions":[], "risks":[]}. Keep it concise.`;

mins.post("/generate", requireProject("member"), async (req, res) => {
  const { meetingId } = req.body || {};
  if (!meetingId) return res.status(400).json({ error: "meetingId required" });

  const { rows } = await db.execute(sql`select project_id as "projectId", title, transcript_text as "tx" from meetings where id = ${meetingId}`);
  const m = rows?.[0];
  if (!m?.tx) return res.status(400).json({ error: "no transcript" });

  const resp = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: [{ role: "system", content: SYS }, { role: "user", content: `Title: ${m.title}\n\nTranscript:\n${m.tx.substring(0, 15000)}` }],
    response_format: { type: "json_object" }
  });

  let out: any = {};
  try { out = JSON.parse(resp.choices[0]?.message?.content || "{}"); } catch { }

  await db.execute(sql`update meetings set summary = ${out.summary || ""}, insights = ${JSON.stringify({ actions: out.actions || [], decisions: out.decisions || [], risks: out.risks || [] })} where id = ${meetingId}`);

  for (const a of (out.actions || [])) {
    await db.execute(
      sql`insert into actions (project_id, title, owner, due_date, status, origin_type, origin_id) values (${m.projectId}, ${a.title || ""}, ${a.assignee || null}, ${a.dueAt || null}, 'pending', 'meeting', ${meetingId})`
    );
  }
  for (const r of (out.risks || [])) {
    const sevMap: any = { 1: "low", 2: "low", 3: "medium", 4: "high", 5: "critical" };
    const sev = sevMap[Math.min(5, Math.max(1, Number(r.severity || 3)))] || "medium";
    await db.execute(
      sql`insert into risks (project_id, title, description, severity, owner, mitigation, status, origin_type, origin_id) values (${m.projectId}, ${r.title || ""}, '', ${sev}, ${r.owner || null}, ${r.mitigation || null}, 'open', 'meeting', ${meetingId})`
    );
  }
  for (const d of (out.decisions || [])) {
    try {
      await db.execute(
        sql`insert into decisions (project_id, decision, decided_by, decided_at, rationale, confidence, origin_type, origin_id) values (${m.projectId}, ${d.decision || ""}, ${d.decidedBy || null}, ${d.decidedAt || null}, null, '0.8', 'meeting', ${meetingId})`
      );
    } catch { }
  }

  res.json({ ok: true, summary: out.summary || "", actions: (out.actions || []).length, risks: (out.risks || []).length, decisions: (out.decisions || []).length });
});
