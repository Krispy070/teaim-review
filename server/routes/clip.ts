import { Router } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import OpenAI from "openai";

export const clip = Router();
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYS = `You are a senior implementation PM. Given a chat log, extract ONLY the parts relevant to project execution:
- decisions (who/what/when),
- action items (with assignee and due date if present),
- configuration/workflow requests,
- testing notes / defects,
- dates/windows, owners, systems.
Remove chit-chat, greetings, repeats, unrelated topics. Keep order and timestamp hints if useful.
Return JSON:
{
 "title": "short title (<=90 chars)",
 "clean_text": "final consolidated text for a doc",
 "actions": [{"title","assignee?","dueAt?"}],
 "decisions": [{"decision","decidedBy?","decidedAt?"}],
 "risks": [{"title","severity(1-5)?","owner?","mitigation?"}]
}`;

function parseMessages(text:string) {
  // Simple parser: split by double newlines or message patterns
  // Expected format: "User: message\n\nUser: message" or just raw text
  const lines = text.split(/\n\s*\n/);
  const msgs = [];
  
  for (const line of lines) {
    const match = line.match(/^([^:]+):\s*(.+)$/s);
    if (match) {
      msgs.push({
        user: match[1].trim(),
        text: match[2].trim(),
        at: new Date().toISOString(),
        meta: { source: 'manual' }
      });
    } else if (line.trim()) {
      msgs.push({
        user: "Unknown",
        text: line.trim(),
        at: new Date().toISOString(),
        meta: { source: 'manual' }
      });
    }
  }
  
  return msgs.length > 0 ? msgs : [{ user: "Unknown", text: text, at: new Date().toISOString(), meta: { source: 'manual' } }];
}

clip.post("/submit", async (req, res) => {
  try {
    const { projectId, source="manual", sourceRef=null, title=null, text="", createInsights=true } = req.body || {};
    if (!projectId || !text.trim()) return res.status(400).json({ error: "projectId & text required" });
    
    // Fetch org_id from project
    const orgResult = await db.execute(sql`select org_id from projects where id = ${projectId}`);
    const orgId = (orgResult.rows?.[0] as any)?.org_id;
    if (!orgId) return res.status(404).json({ error:"project not found" });

    const resp = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1,
      messages: [{ role: "system", content: SYS }, { role: "user", content: text.slice(0, 15000) }],
      response_format: { type: "json_object" }
    });

    let out:any = {};
    try { out = JSON.parse(resp.choices[0]?.message?.content || "{}"); } catch {}
    const docTitle = title || out.title || `Conversation (${new Date().toLocaleString()})`;
    const clean = out.clean_text || text;

    // Parse and save conversation with messages
    const msgs = parseMessages(text);
    const convIns = await db.execute(
      sql`insert into conversations (project_id, source, source_ref, title) values (${projectId},${source},${sourceRef},${docTitle}) returning id`
    );
    const convId = convIns.rows?.[0]?.id;
    
    // Save messages
    for (const m of msgs) {
      await db.execute(
        sql`insert into conversation_messages (project_id, conversation_id, author, text, at, meta)
         values (${projectId},${convId},${m.user||""},${m.text||""},${m.at},${JSON.stringify(m.meta||{})}::jsonb)`
      );
    }

    const storagePath = `conversations/${convId}.txt`;
    const docIns = await db.execute(
      sql`insert into docs (org_id, project_id, name, mime, size_bytes, storage_path, full_text, summary, keywords, meta, has_pii)
       values (${orgId},${projectId},${"Conversation — " + docTitle},'text/plain','0',${storagePath},${clean},null,'[]'::jsonb,${JSON.stringify({ source, sourceRef, conversationId: convId })}::jsonb,false) returning id`
    );
    const docId = docIns.rows?.[0]?.id;
    await db.execute(sql`insert into embed_jobs (project_id, doc_id, status) values (${projectId},${docId},'pending') on conflict do nothing`);
    await db.execute(sql`insert into parse_jobs (project_id, doc_id, status) values (${projectId},${docId},'pending') on conflict do nothing`);

    if (!createInsights) {
      return res.json({ ok: true, docId, conversationId: convId, messages: msgs.length, actions: 0, risks: 0, decisions: 0 });
    }
    
    const a = Array.isArray(out.actions) ? out.actions : [];
    const r = Array.isArray(out.risks) ? out.risks : [];
    const dec = Array.isArray(out.decisions) ? out.decisions : [];

    for (const x of a) {
      try {
        let dueAt = null;
        if (x.dueAt) {
          const dt = new Date(x.dueAt);
          if (!isNaN(dt.getTime()) && dt.getFullYear() > 1900) dueAt = dt.toISOString();
        }
        await db.execute(
          sql`insert into actions_extracted (project_id, doc_id, title, assignee, due_at, priority, status, confidence, source)
           values (${projectId},${docId},${x.title||""},${x.assignee||null},${dueAt},'normal','open','0.8','conversation')`
        );
      } catch (e: any) {
        console.error('[clip] Action insert failed:', e?.message, 'for action:', x);
      }
    }
    for (const x of r) {
      try {
        const severity = Math.min(5, Math.max(1, Number(x.severity||3)));
        await db.execute(
          sql`insert into risks (org_id, project_id, title, description, severity, owner, mitigation, status)
           values (${orgId},${projectId},${x.title||""},"",${severity},${x.owner||null},${x.mitigation||null},'open')`
        );
      } catch (e: any) {
        console.error('[clip] Risk insert failed:', e?.message, 'for risk:', x);
      }
    }
    for (const x of dec) {
      try {
        let decidedAt = null;
        if (x.decidedAt) {
          const dt = new Date(x.decidedAt);
          if (!isNaN(dt.getTime()) && dt.getFullYear() > 1900) decidedAt = dt.toISOString();
        }
        await db.execute(
          sql`insert into decisions (org_id, project_id, decision, decided_by, decided_at, rationale, confidence, source, doc_id)
           values (${orgId},${projectId},${x.decision||""},${x.decidedBy||null},${decidedAt},null,'0.8','conversation',${docId})`
        );
      } catch (e: any) {
        console.error('[clip] Decision insert failed:', e?.message, 'for decision:', x);
      }
    }

    return res.json({ ok: true, docId, conversationId: convId, messages: msgs.length, actions: a.length, risks: r.length, decisions: dec.length });
  } catch (e:any) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
});
