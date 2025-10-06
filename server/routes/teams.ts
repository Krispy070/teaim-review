import { Router } from "express";
import OpenAI from "openai";
import { db } from "../db/client";
import { sql } from "drizzle-orm";

export const teams = Router();
const ai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function cleanConversation(topic:string, transcript:string){
  const SYS = `You are a senior PM. Keep only relevant content from this Teams conversation for the last day; trim older history. Output concise markdown with: Context, Decisions, Requests, Open Questions.`;
  const r = await ai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: [{ role:"system", content: SYS }, { role:"user", content: `Topic: ${topic||"(general)"}\n\nTranscript:\n${transcript.slice(0,18000)}` }]
  });
  return r.choices[0]?.message?.content || transcript;
}

async function saveDoc(projectId:string, orgId:string, name:string, text:string, meta:any, conversationId?:string){
  const storagePath = conversationId ? `conversations/${conversationId}.md` : `teams/${Date.now()}.md`;
  const ins = await db.execute(
    sql`insert into docs (org_id, project_id, name, mime, size_bytes, storage_path, full_text, summary, keywords, meta, has_pii)
     values (${orgId},${projectId},${name},'text/markdown','0',${storagePath},${text},null,'[]'::jsonb,${JSON.stringify(meta)}::jsonb,false) returning id`
  );
  const docId = ins.rows?.[0]?.id;
  await db.execute(sql`insert into embed_jobs (project_id, doc_id, status) values (${projectId},${docId},'pending') on conflict do nothing`);
  await db.execute(sql`insert into parse_jobs (project_id, doc_id, status) values (${projectId},${docId},'pending') on conflict do nothing`);
  return docId;
}

async function saveConversation(projectId:string, source:"teams"|"slack"|"manual", ref:string|null, title:string, createdBy:string|null, msgs:any[]){
  const cin = await db.execute(
    sql`insert into conversations (project_id, source, source_ref, title, created_by) values (${projectId},${source},${ref||null},${title},${createdBy}) returning id`
  );
  const convId = cin.rows?.[0]?.id;
  for (const m of msgs) {
    const at = m.at ? new Date(m.at).toISOString() : null;
    await db.execute(
      sql`insert into conversation_messages (project_id, conversation_id, author, text, at, meta)
       values (${projectId},${convId},${m.user||m.author||""},${m.text||""},${at},${JSON.stringify(m.meta||{})}::jsonb)`
    );
  }
  return convId;
}

function parseTeamsMessages(text:string) {
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
        meta: { source: 'teams_raw' }
      });
    } else if (line.trim()) {
      // If no user prefix, treat as anonymous message
      msgs.push({
        user: "Unknown",
        text: line.trim(),
        at: new Date().toISOString(),
        meta: { source: 'teams_raw' }
      });
    }
  }
  
  return msgs.length > 0 ? msgs : [{ user: "Unknown", text: text, at: new Date().toISOString(), meta: { source: 'teams_raw' } }];
}

teams.post("/clip", async (req:any, res) => {
  const { projectId, link="", text="", topic="", createDoc=false } = req.body || {};
  if (!projectId || (!text.trim() && !link.trim())) return res.status(400).json({ error:"projectId & (text|link) required" });

  try {
    // Fetch org_id from project
    const orgResult = await db.execute(sql`select org_id from projects where id = ${projectId}`);
    const orgId = (orgResult.rows?.[0] as any)?.org_id;
    if (!orgId) return res.status(404).json({ error:"project not found" });
    
    // Check if it's a Teams link - currently not supported
    const sourceRef = link.trim().match(/^https?:\/\//i) ? link.trim() : null;
    if (sourceRef && /teams\.microsoft\.com/.test(sourceRef)) {
      return res.status(501).json({ 
        error: "Teams link parsing requires Microsoft Graph API authentication. Please paste the conversation text directly instead." 
      });
    }

    const transcript = text.trim() || "(no text)";
    const msgs = parseTeamsMessages(transcript);
    const title = (msgs[0]?.text || "Teams conversation").slice(0,120).replace(/^\s+|\s+$/g,"");

    const convId = await saveConversation(projectId, "teams", sourceRef, title, null, msgs);

    let docId:string|null = null;
    if (createDoc) {
      const cleaned = await cleanConversation(topic||"", transcript);
      const name = `[Teams] ${title}`;
      docId = await saveDoc(projectId, orgId, name, cleaned, { source:"teams", link:sourceRef||"", conversationId: convId }, convId);
    }

    return res.json({ ok:true, convId, docId, messages: msgs.length });
  } catch (e:any) { 
    return res.status(500).json({ error:String(e?.message||e) }); 
  }
});
