import { Router } from "express";
import { db } from "../db/client";
import fetch from "node-fetch";
import { requireProject } from "../auth/projectAccess";

export const mpost = Router();

/* POST /api/ma/separations/:id/post-checklist  { projectId, category? } */
mpost.post("/separations/:id/post-checklist", requireProject("member"), async (req,res)=>{
  const eid = String(req.params.id||"");
  const { projectId, category="plan" } = req.body||{};
  if (!projectId || !eid) return res.status(400).json({ error:"projectId & eventId" });

  const ev = (await db.execute(
    `select title, type, scheduled_at as "scheduledAt" from separation_events where id=$1 and project_id=$2`,
    [eid, projectId] as any
  )).rows?.[0];
  if (!ev) return res.status(404).json({ error:"event not found" });

  const tasks = (await db.execute(
    `select title, status, owner, due_at as "dueAt"
       from separation_tasks where event_id=$1 order by created_at asc`, [eid] as any
  )).rows || [];

  const em = (s:string)=>{
    const x = String(s||"").toLowerCase();
    if (x==="done") return "✅";
    if (x==="blocked") return "⛔";
    if (x==="in_progress") return "🔵";
    return "☐"; // planned
  };

  const header = `M&A Checklist — ${ev.title} (${ev.type})${ev.scheduledAt?` • ${new Date(ev.scheduledAt).toLocaleString()}`:""}`;
  const lines: string[] = [header];
  const max = 30; // protect channels from huge posts
  for (const t of tasks.slice(0,max)){
    const due = t.dueAt ? ` (due ${new Date(t.dueAt).toLocaleDateString()})` : "";
    const own = t.owner ? ` • ${t.owner}` : "";
    lines.push(`${em(t.status)} ${t.title}${own}${due}`);
  }
  if (tasks.length>max) lines.push(`… +${tasks.length-max} more`);

  try {
    const msgRes = await fetch(`http://localhost:${process.env.PORT||5000}/api/messaging/post`, {
      method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ projectId, category, text: lines.join("\n") })
    });
    
    if (!msgRes.ok) {
      const errText = await msgRes.text().catch(()=>"");
      return res.status(502).json({ error: `Failed to post to channel: ${errText || msgRes.statusText}` });
    }

    res.json({ ok:true, posted: true, count: Math.min(tasks.length, max) });
  } catch (err:any) {
    res.status(502).json({ error: `Failed to post to channel: ${err.message||"network error"}` });
  }
});

export default mpost;
