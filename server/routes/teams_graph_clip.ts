import { Router } from "express";
import fetch from "node-fetch";
import { db } from "../db/client";
import { getGraphAccessToken } from "./teams_oauth";
import OpenAI from "openai";
import { sql } from "drizzle-orm";
import { requireProject } from "../auth/projectAccess";
import { acquire } from "../lib/concurrency";
import { hostOf } from "../lib/net";

const HTTP_GLOBAL_MAX = Number(process.env.TEAIM_HTTP_GLOBAL_MAX || 12);
const HTTP_PER_HOST_MAX = Number(process.env.TEAIM_HTTP_PER_HOST_MAX || 6);

async function gfetch(url:string, token:string){
  const relG = await acquire("http:global", HTTP_GLOBAL_MAX);
  const relH = await acquire(`http:host:${hostOf(url)}`, HTTP_PER_HOST_MAX);
  try { return await fetch(url, { headers: { Authorization:`Bearer ${token}` } }); }
  finally { relH(); relG(); }
}

export const tgraph = Router();
const ai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function parseTeamsLink(url:string){
  try {
    const u = new URL(url);
    const groupId = u.searchParams.get("groupId") || "";
    const tenantId = u.searchParams.get("tenantId") || "";
    const path = u.pathname;
    const parts = path.split("/").filter(Boolean);
    const messageId = parts[parts.length-1] || "";
    const resourceId = parts.length>=3 ? parts[2] : "";
    const isChat = /@unq\.gbl\.spaces/i.test(resourceId);
    const isThread = /@thread\./i.test(resourceId);
    
    const chatId = isChat ? resourceId : "";
    return { groupId, tenantId, messageId, chatId, isChat, resourceId };
  } catch { 
    return { groupId:"", tenantId:"", messageId:"", chatId:"", isChat:false, resourceId:"" }; 
  }
}

async function cleanConversation(topic:string, transcript:string){
  const SYS = `You are a senior PM. Keep only relevant content for today; output concise markdown: Context, Decisions, Requests, Open Questions.`;
  const r = await ai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: [{ role:"system", content: SYS }, { role:"user", content: `Topic: ${topic||"(general)"}\n\nTranscript:\n${transcript.slice(0,18000)}` }]
  });
  return r.choices[0]?.message?.content || transcript;
}

async function saveConversation(projectId:string, title:string, ref:string, msgs:any[]){
  const ins = await db.execute(
    sql`insert into conversations (project_id, source, source_ref, title) values (${projectId},'teams',${ref||null},${title||"Teams Thread"}) returning id`
  );
  const convId = (ins.rows?.[0] as any)?.id;
  for (const m of msgs) {
    await db.execute(
      sql`insert into conversation_messages (project_id, conversation_id, author, text, at, meta)
       values (${projectId},${convId},${m.author||""},${m.text||""},${m.at||new Date().toISOString()},${JSON.stringify(m.meta||{})})`
    );
  }
  return convId;
}

async function saveDoc(projectId:string, name:string, text:string, meta:any){
  const ins = await db.execute(
    sql`insert into docs (project_id, name, mime, size_bytes, full_text, summary, keywords, meta, has_pii, storage_path)
     values (${projectId},${name},'text/markdown','0',${text},null,'[]'::jsonb,${JSON.stringify(meta)},false,'') returning id`
  );
  const docId = (ins.rows?.[0] as any)?.id;
  await db.execute(sql`insert into embed_jobs (project_id, doc_id, status) values (${projectId},${docId},'pending') on conflict do nothing`);
  await db.execute(sql`insert into parse_jobs (project_id, doc_id, status) values (${projectId},${docId},'pending') on conflict do nothing`);
  return docId;
}

tgraph.post("/graph", requireProject("member"), async (req: any, res) => {
  try {
    const { projectId, link="", teamId="", channelId="", messageId="", topic="", createDoc=false } = req.body||{};
    if (!projectId) return res.status(400).json({ error:"projectId required" });

    const token = await getGraphAccessToken(projectId);

    const parsed = link ? parseTeamsLink(link) : { groupId: teamId, messageId, chatId: "", isChat:false };
    const tid = teamId || parsed.groupId || "";
    const mid = messageId || parsed.messageId || "";
    const cht = channelId || "";
    const chatId = parsed.chatId || "";

    if (!mid) return res.status(400).json({ error:"Provide link or messageId" });

    let messages:any[] = [];

    if (parsed.isChat && chatId) {
      const base = `https://graph.microsoft.com/v1.0/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(mid)}`;
      const rootR = await gfetch(base, token);
      if (rootR.ok) {
        const root = await rootR.json();
        messages.push(root);
        const repR = await gfetch(`${base}/replies`, token);
        if (repR.ok) {
          const jr = await repR.json(); 
          messages = messages.concat(jr.value||[]);
        }
      }
    }

    if (!messages.length) {
      if (cht) {
        const base = `https://graph.microsoft.com/v1.0/teams/${tid}/channels/${cht}/messages/${encodeURIComponent(mid)}`;
        const rootR = await gfetch(base, token);
        if (rootR.ok) {
          const root = await rootR.json(); 
          messages.push(root);
          const jr = await (await gfetch(`${base}/replies`, token)).json();
          messages = messages.concat(jr.value||[]);
        }
      } else if (tid) {
        const chR = await gfetch(`https://graph.microsoft.com/v1.0/teams/${tid}/channels`, token);
        const chs = chR.ok ? (await chR.json()).value || [] : [];
        for (const c of chs) {
          const base = `https://graph.microsoft.com/v1.0/teams/${tid}/channels/${c.id}/messages/${encodeURIComponent(mid)}`;
          const rootR = await gfetch(base, token);
          if (!rootR.ok) continue;
          const root = await rootR.json();
          messages.push(root);
          const jr = await (await gfetch(`${base}/replies`, token)).json();
          messages = messages.concat(jr.value||[]);
          break;
        }
      }
    }

    if (!messages.length) return res.status(404).json({ error:"Message not found (check channelId or chatId permissions)" });

    const norm = messages.map((m:any)=>({
      author: m?.from?.user?.displayName || "user",
      text: (m?.body?.content || "").replace(/<[^>]+>/g,"").trim(),
      at: m?.createdDateTime || new Date().toISOString(),
      meta: { teams: { id: m?.id, teamId: tid, channelId: cht||null, chatId: chatId||null } }
    })).filter(x=>x.text);

    const title = (norm[0]?.text||"Teams Thread").slice(0,140).replace(/\n+/g," ");
    const convId = await saveConversation(projectId, title, link||"", norm);

    let docId:string|null = null;
    if (createDoc) {
      const start = new Date(); start.setUTCHours(0,0,0,0);
      const today = norm.filter(m=> new Date(m.at).getTime() >= start.getTime());
      const transcript = today.map(m=>`**${m.author}** (${new Date(m.at).toLocaleString()}):\n${m.text}`).join("\n\n");
      const cleaned = await cleanConversation(topic||"", transcript);
      docId = await saveDoc(projectId, `[Teams] ${title}`, cleaned, { source:"teams", link, teamId: tid, channelId: cht||undefined, chatId: chatId||undefined });
    }

    res.json({ ok:true, convId, docId, messages:norm.length });
  } catch (e:any) {
    res.status(500).json({ error:String(e?.message||e) });
  }
});

// POST /api/teams/clip/validate { projectId, link }
tgraph.post("/validate", requireProject("member"), async (req: any, res) => {
  try {
    const { projectId, link } = req.body || {};
    if (!projectId || !link) return res.status(400).json({ error: "projectId & link required" });

    const token = await getGraphAccessToken(projectId).catch(()=>null);
    if (!token) return res.status(401).json({ error: "Teams not connected", suggestion: "Click Connect Teams then retry." });

    const parsed = parseTeamsLink(link);
    if (!parsed.messageId) return res.status(400).json({ error: "Could not parse messageId from link.", parsed });

    const out:any = { parsed, found:false, type: parsed.isChat ? "chat" : "channel", checked: [] };

    // Try chat first if looks like chat
    if (parsed.isChat && parsed.chatId) {
      const base = `https://graph.microsoft.com/v1.0/chats/${encodeURIComponent(parsed.chatId)}/messages/${encodeURIComponent(parsed.messageId)}`;
      const r = await gfetch(base, token);
      out.checked.push({ url: base, status: r.status });
      if (r.ok) { out.found = true; return res.json({ ok:true, ...out }); }
      if (r.status === 403) out.suggestion = "Grant Chat.Read.All (delegated) to the app and consent.";
    }

    // Channel fallback: need groupId (teamId)
    if (!parsed.groupId) {
      out.error = "No team (groupId) in link; cannot enumerate channels.";
      out.suggestion = "Paste a link that includes groupId or provide channelId explicitly in the Clip form.";
      return res.status(200).json({ ok:false, ...out });
    }

    // Enumerate channels and probe for the message
    const chReq = await gfetch(`https://graph.microsoft.com/v1.0/teams/${parsed.groupId}/channels`, token);
    const chs = chReq.ok ? (await chReq.json()).value || [] : [];
    out.channels = chs.map((c:any)=>({ id:c.id, displayName:c.displayName }));

    for (const c of chs) {
      const base = `https://graph.microsoft.com/v1.0/teams/${parsed.groupId}/channels/${c.id}/messages/${encodeURIComponent(parsed.messageId)}`;
      const r = await gfetch(base, token);
      out.checked.push({ url: base, status: r.status });
      if (r.ok) { out.found = true; out.channelId = c.id; break; }
    }

    if (!out.found) {
      out.error = "Message not found in team channels.";
      if (chReq.status === 403) out.suggestion = "Grant ChannelMessage.Read.All (delegated) and consent for the tenant.";
    }
    res.json({ ok: out.found, ...out });
  } catch (e:any) {
    res.status(500).json({ ok:false, error: String(e?.message||e) });
  }
});
