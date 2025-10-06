import { Router } from "express";
import { db } from "../db/client";
import OpenAI from "openai";
import { requireProject } from "../auth/projectAccess";
import { sql } from "drizzle-orm";

export const convBulk = Router();
const ai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function summarizeIfNeeded(id:string){
  const row = (await db.execute(
    sql`select project_id as "projectId", title, summary, insights from conversations where id=${id}`
  )).rows?.[0] as any;
  if (!row) return null;
  if (row.summary && row.insights && (Array.isArray(row.insights.actions))) return row;

  const msgs = (await db.execute(
    sql`select author, text, at from conversation_messages where conversation_id=${id} order by at asc`
  )).rows||[];
  const start = new Date(); start.setUTCHours(0,0,0,0);
  const today = (msgs as any[]).filter(m => new Date(m.at||Date.now()).getTime() >= start.getTime());
  const transcript = today.map(m => `**${m.author||"user"}** (${new Date(m.at).toLocaleString()}):\n${m.text}`).join("\n\n");

  const SYS = `You are a senior PM. Output JSON: {"summary":"...","actions":[{title,assignee?,dueAt?}],"decisions":[...],"risks":[...]} focusing strictly on today's content.`;
  const r = await ai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: [{ role:"system", content: SYS }, { role:"user", content: transcript.slice(0,18000) }],
    response_format: { type:"json_object" }
  });
  let out:any={ summary:"", actions:[], decisions:[], risks:[] };
  try { out = JSON.parse(r.choices[0]?.message?.content || "{}"); } catch {}

  await db.execute(
    sql`update conversations set summary=${out.summary||""}, insights=${JSON.stringify({ actions: out.actions||[], decisions: out.decisions||[], risks: out.risks||[] })}, summarized_at=now() where id=${id}`
  );
  return { ...row, summary: out.summary||"", insights: { actions: out.actions||[], decisions: out.decisions||[], risks: out.risks||[] } };
}

convBulk.post("/bulk-apply", requireProject("member"), async (req: any, res)=>{
  const { projectId, ids=[], dedupeDays=7 } = req.body||{};
  if (!projectId || !Array.isArray(ids) || !ids.length) return res.status(400).json({ error:"projectId & ids required" });

  const orgResult = await db.execute(
    sql`select org_id from projects where id=${projectId}`
  );
  const orgId = (orgResult.rows?.[0] as any)?.org_id;
  if (!orgId) return res.status(404).json({ error: "project not found" });

  let created = 0, scanned = 0;
  for (const id of ids) {
    const c = await summarizeIfNeeded(id);
    scanned++;
    const acts = Array.isArray(c?.insights?.actions) ? c!.insights.actions : [];
    for (const a of acts) {
      const title = String(a.title||"").trim();
      if (!title) continue;
      const dupe = await db.execute(
        sql`select 1 from actions where project_id=${projectId} and title=${title} and created_at >= now() - (${String(dedupeDays)} || ' days')::interval limit 1`
      );
      if (dupe.rows?.length) continue;
      await db.execute(
        sql`insert into actions (org_id, project_id, title, owner, due_date, status, extracted_from)
         values (${orgId},${projectId},${title},${a.assignee||null},${a.dueAt||null},'open',${`conversation:${id}`})`
      );
      created++;
    }
  }
  res.json({ ok:true, scanned, created });
});

convBulk.post("/merge", requireProject("member"), async (req: any, res)=>{
  const { projectId, intoId, fromIds=[] } = req.body||{};
  if (!projectId || !intoId || !Array.isArray(fromIds) || !fromIds.length) return res.status(400).json({ error:"projectId, intoId, fromIds required" });

  const intoCheck = await db.execute(sql`select 1 from conversations where id=${intoId} and project_id=${projectId} limit 1`);
  if (!intoCheck.rows?.length) return res.status(404).json({ error:"Target conversation not found in project" });

  let moved = 0, removed = 0;
  for (const fid of fromIds) {
    const fromCheck = await db.execute(sql`select 1 from conversations where id=${fid} and project_id=${projectId} limit 1`);
    if (!fromCheck.rows?.length) continue;
    
    const { rows } = await db.execute(sql`update conversation_messages set conversation_id=${intoId} where conversation_id=${fid} returning id`);
    moved += rows?.length || 0;
    await db.execute(sql`delete from conversations where id=${fid} and project_id=${projectId}`);
    removed++;
  }
  res.json({ ok:true, moved, removed });
});

convBulk.delete("/:id", requireProject("member"), async (req: any, res)=>{
  const id = String(req.params.id||"");
  const projectId = req.query.projectId as string;
  if (!projectId) return res.status(400).json({ error:"projectId required" });
  
  const check = await db.execute(sql`select 1 from conversations where id=${id} and project_id=${projectId} limit 1`);
  if (!check.rows?.length) return res.status(404).json({ error:"Conversation not found in project" });
  
  await db.execute(sql`delete from conversation_messages where conversation_id=${id}`);
  await db.execute(sql`delete from conversations where id=${id} and project_id=${projectId}`);
  res.json({ ok:true });
});

convBulk.post("/sweep-empties", requireProject("member"), async (req, res) => {
  const { projectId, olderThanDays = 3 } = req.body || {};
  if (!projectId) return res.status(400).json({ error: "projectId required" });

  const { rows } = await db.execute(
    `select id from conversations
      where project_id=$1
        and created_at < now() - ($2 || ' days')::interval
        and not exists (select 1 from conversation_messages m where m.conversation_id = conversations.id)
      limit 1000`,
    [projectId, String(olderThanDays)] as any
  );
  const ids = (rows || []).map((r: any) => r.id);
  if (ids.length) {
    await db.execute(`delete from conversations where id = any($1::uuid[])`, [ids] as any);
  }
  res.json({ ok: true, removed: ids.length });
});
