import { Router } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { requireProject } from "../auth/projectAccess";
import OpenAI from "openai";

const conv = Router();
const ai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

conv.get("/", requireProject("member"), async (req: any, res) => {
  const projectId = req.projectId;
  
  const result = await db.execute(
    sql`select id, project_id as "projectId", source, source_ref as "sourceRef", title, created_by as "createdBy", 
        summary, insights, summarized_at as "summarizedAt", created_at as "createdAt"
        from conversations 
        where project_id=${projectId} 
        order by created_at desc`
  );
  
  res.json(result.rows || []);
});

conv.get("/:id", requireProject("member"), async (req: any, res) => {
  const id = String(req.params.id || "");
  
  const convResult = await db.execute(
    sql`select id, project_id as "projectId", source, source_ref as "sourceRef", title, created_by as "createdBy",
        summary, insights, summarized_at as "summarizedAt", created_at as "createdAt"
        from conversations 
        where id=${id}`
  );
  
  if (!convResult.rows?.length) {
    return res.status(404).json({ error: "not found" });
  }
  
  const conversation = convResult.rows[0];
  
  const msgsResult = await db.execute(
    sql`select id, author, text, at, meta 
        from conversation_messages 
        where conversation_id=${id} 
        order by at asc`
  );
  
  res.json({
    ...conversation,
    messages: msgsResult.rows || []
  });
});

conv.post("/:id/summarize", requireProject("member"), async (req: any, res) => {
  const id = String(req.params.id || "");
  const topic = String(req.body?.topic || "");
  
  const c = await db.execute(
    sql`select project_id as "projectId", title from conversations where id=${id}`
  );
  if (!c.rows?.length) return res.status(404).json({ error: "not found" });
  
  const conv = c.rows[0] as any;

  const msgs = await db.execute(
    sql`select author, text, at from conversation_messages where conversation_id=${id} order by at asc`
  );

  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const today = (msgs.rows || []).filter((m: any) => new Date(m.at || Date.now()).getTime() >= start.getTime());
  const transcript = today
    .map((m: any) => `**${m.author || "user"}** (${new Date(m.at).toLocaleString()}):\n${m.text}`)
    .join("\n\n");

  const SYS = `You are a senior PM. Produce:
- "summary": concise TL;DR.
- "actions": [{title, assignee?, dueAt?}]
- "decisions": [{decision, decidedBy?, decidedAt?}]
- "risks": [{title, severity(1-5), owner?, mitigation?}]
Focus strictly on today's relevant content. Output strict JSON.`;

  const r = await ai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: [
      { role: "system", content: SYS },
      { role: "user", content: `Topic: ${topic || "(general)"}\n\nTranscript:\n${transcript.slice(0, 18000)}` }
    ],
    response_format: { type: "json_object" }
  });

  let out: any = { summary: "", actions: [], decisions: [], risks: [] };
  try {
    out = JSON.parse(r.choices[0]?.message?.content || "{}");
  } catch {}

  await db.execute(
    sql`update conversations set summary=${out.summary || ""}, insights=${JSON.stringify({
      actions: out.actions || [],
      decisions: out.decisions || [],
      risks: out.risks || []
    })}::jsonb, summarized_at=now() where id=${id}`
  );

  res.json({
    ok: true,
    summary: out.summary || "",
    counts: {
      actions: (out.actions || []).length,
      decisions: (out.decisions || []).length,
      risks: (out.risks || []).length
    }
  });
});

conv.post("/:id/apply-actions", requireProject("member"), async (req: any, res) => {
  const id = String(req.params.id || "");
  
  const c = await db.execute(
    sql`select project_id as "projectId", insights from conversations where id=${id}`
  );
  if (!c.rows?.length) return res.status(404).json({ error: "not found" });
  
  const convData = c.rows[0] as any;
  
  const orgResult = await db.execute(
    sql`select org_id from projects where id=${convData.projectId}`
  );
  const orgId = (orgResult.rows?.[0] as any)?.org_id;
  if (!orgId) return res.status(404).json({ error: "project not found" });
  
  const acts = Array.isArray(convData.insights?.actions) ? convData.insights.actions : [];
  const created: { id: string; title: string }[] = [];
  
  for (const a of acts) {
    const title = String(a.title || "").trim();
    if (!title) continue;

    const dupe = await db.execute(
      sql`select 1 from actions where project_id=${convData.projectId} and title=${title} and created_at >= now() - interval '7 days' limit 1`
    );
    if (dupe.rows?.length) continue;

    const ins = await db.execute(
      sql`insert into actions (org_id, project_id, title, owner, due_date, status, extracted_from, origin_type, origin_id)
       values (${orgId},${convData.projectId},${title},${a.assignee || null},${a.dueAt || null},'open',${`conversation:${id}`},'conversation',${id})
       returning id`
    );
    created.push({ id: (ins.rows?.[0] as any)?.id, title });
  }
  
  res.json({ ok: true, createdCount: created.length, created });
});

conv.get("/:id/actions", requireProject("member"), async (req: any, res) => {
  const id = String(req.params.id || "");
  const rows = await db.execute(
    sql`select id, title, status, priority, owner as assignee, due_date as "dueAt", created_at as "createdAt"
       from actions
      where extracted_from=${`conversation:${id}`}
      order by created_at desc limit 200`
  );
  res.json({ ok: true, items: rows.rows || [] });
});

export default conv;
