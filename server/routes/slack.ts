import { Router } from "express";
import OpenAI from "openai";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { verifySlack, parseSlackPermalink, slackWeb } from "../lib/slack";
import { readSecret } from "../lib/secretReader";

export const slack = Router();
const ai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function cleanConversation(topic:string, transcript:string) {
  const SYS = `You are a senior PM. Keep only content relevant to the user's topic in the last day; remove noise, greetings, and irrelevant history. Output concise, structured markdown with sections: Context, Decisions, Requests, Open Questions.`;
  const prompt = `Topic: ${topic||"(general)"}\n\nTranscript:\n${transcript.slice(0,18000)}`;
  const r = await ai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: [{ role:"system", content: SYS }, { role:"user", content: prompt }]
  });
  return r.choices[0]?.message?.content || transcript;
}

async function saveDoc(projectId:string, orgId:string, name:string, text:string, meta:any, conversationId?:string){
  const storagePath = conversationId ? `conversations/${conversationId}.md` : `slack/${Date.now()}.md`;
  const ins = await db.execute(
    sql`insert into docs (org_id, project_id, name, mime, size_bytes, storage_path, full_text, summary, keywords, meta, has_pii)
     values (${orgId},${projectId},${name},'text/markdown','0',${storagePath},${text},null,'[]'::jsonb,${JSON.stringify(meta)}::jsonb,false) returning id`
  );
  const docId = ins.rows?.[0]?.id;
  await db.execute(sql`insert into embed_jobs (project_id, doc_id, status) values (${projectId},${docId},'pending') on conflict do nothing`);
  await db.execute(sql`insert into parse_jobs (project_id, doc_id, status) values (${projectId},${docId},'pending') on conflict do nothing`);
  return docId;
}

async function saveConversation(projectId:string, source:"slack"|"teams"|"manual", ref:string|null, title:string, createdBy:string|null, msgs:any[]){
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

slack.post("/commands", async (req:any, res) => {
  const text = String(req.body?.text||"");
  const projectMatch = text.match(/project:([0-9a-f\-]{36})/i);
  const topicMatch   = text.match(/topic:"([^"]+)"/i) || text.match(/topic:([^\s]+)/i);
  const permalink    = (text.match(/https?:\/\/\S+/i)||[])[0];
  const projectId    = projectMatch?.[1] || null;
  const createDoc    = /\bdoc\b/i.test(text);

  if (!projectId) return res.status(200).json({ text: "TEAIM: include project:<uuid>" });
  const signing = await readSecret(projectId, "project", null, "SLACK_SIGNING_SECRET");
  if (!signing || !verifySlack(req, signing)) return res.status(401).send("bad sig");
  if (!permalink) return res.status(200).json({ text: "Usage: /teaim clip <permalink> [project:<id>] [topic:\"...\"] [doc]" });

  try {
    const out = await clipSlackLink({ projectId, permalink, topic: topicMatch?.[1] || "", createDoc, slackTeam:req.body?.team_id, slackUser:req.body?.user_id, slackChannel:req.body?.channel_id });
    return res.status(200).json({ text: `TEAIM: clipped ${out.messages} message(s)${out.docId?` → Doc ${out.docId}`:""}` });
  } catch (e:any) {
    return res.status(200).json({ text: `TEAIM error: ${e?.message||e}` });
  }
});

slack.post("/clip", async (req:any, res) => {
  const { projectId, permalink, topic="", createDoc=false } = req.body || {};
  if (!projectId || !permalink) return res.status(400).json({ error:"projectId & permalink required" });
  try {
    const out = await clipSlackLink({ projectId, permalink, topic, createDoc });
    res.json({ ok:true, ...out });
  } catch (e:any) { res.status(500).json({ error:String(e?.message||e) }); }
});

async function clipSlackLink({ projectId, permalink, topic, createDoc, slackTeam, slackUser, slackChannel }:{
  projectId:string; permalink:string; topic?:string; createDoc?:boolean; slackTeam?:string; slackUser?:string; slackChannel?:string;
}){
  // Fetch org_id from project
  const orgResult = await db.execute(sql`select org_id from projects where id = ${projectId}`);
  const orgId = (orgResult.rows?.[0] as any)?.org_id;
  if (!orgId) throw new Error("project not found");
  
  const bot = await readSecret(projectId, "project", null, "SLACK_BOT_TOKEN");
  if (!bot) throw new Error("Missing SLACK_BOT_TOKEN in Secrets");

  const ref = parseSlackPermalink(permalink);
  if (!ref) throw new Error("Invalid Slack permalink");

  const thread = await slackWeb(bot, "conversations.replies", { channel: ref.channel, ts: ref.ts, inclusive:true, limit:200 });
  const msgs = (thread.messages||[]).map((m:any)=>({
    user: m.user || m.username || (m.bot_id ? "bot" : ""),
    text: m.text || "",
    at: m.ts ? new Date(Number(m.ts.split(".")[0])*1000).toISOString() : new Date().toISOString(),
    meta: { slack: { channel: ref.channel, ts: m.ts, thread_ts: ref.ts } }
  }));

  const start = new Date(); start.setUTCHours(0,0,0,0);
  const today = msgs.filter(m => new Date(m.at).getTime() >= start.getTime());

  const title = (msgs[0]?.text || "Slack Thread").slice(0,140).replace(/\n+/g," ");
  const convId = await saveConversation(projectId, "slack", permalink, title, slackUser||null, today);

  let docId:string|null = null;
  if (createDoc) {
    const raw = today.map(m => `**${m.user||"user"}** (${new Date(m.at).toLocaleString()}):\n${m.text}`).join("\n\n");
    const cleaned = await cleanConversation(topic||"", raw);
    const name = `[Slack] ${title}`;
    docId = await saveDoc(projectId, orgId, name, cleaned, { source:"slack", permalink, participants: Array.from(new Set(today.map(m=>m.user))).slice(0,20), conversationId: convId }, convId);
  }

  return { messages: today.length, convId, docId };
}
