import { Router } from "express";
import { requireProject, getUser } from "../auth/projectAccess";
import { db } from "../db/client";
import { sql } from "drizzle-orm";

export const mywork = Router();

mywork.get("/", requireProject("member"), async (req, res, next) => {
  try {
    const projectId = String(req.query.projectId || "");
    if (!projectId) return res.status(400).json({ error: "projectId required" });
    const u = getUser(req);
    const email = (u?.email || "").toLowerCase();
    const nameLike = email.split("@")[0];

    const { rows: items } = await db.execute(sql`
      select id, title, assignee, due_at as "dueAt", priority, status, doc_id as "docId", created_at as "createdAt"
      from actions_extracted
      where project_id = ${projectId}
        and (coalesce(lower(assignee),'') = ${email} or coalesce(lower(assignee),'') like ${`%${nameLike}%`})
      order by coalesce(due_at, created_at) asc
      limit 200
    `);

    const now = Date.now();
    const soonCut = now + 1000*60*60*24*7;
    const toTs = (d:any)=> d? new Date(d).getTime(): undefined;

    const open = items.filter(i => !["done","archived"].includes(((i as any).status||"").toLowerCase()));
    const overdue = open.filter(i => toTs((i as any).dueAt)!=null && toTs((i as any).dueAt)! < now);
    const soon = open.filter(i => toTs((i as any).dueAt)!=null && toTs((i as any).dueAt)! >= now && toTs((i as any).dueAt)! <= soonCut);
    const nodue = open.filter(i => !(i as any).dueAt);

    res.json({
      ok: true,
      counts: { open: open.length, overdue: overdue.length, dueSoon: soon.length },
      buckets: {
        overdue, 
        dueSoon: soon, 
        noDueDate: nodue,
        recentDone: items.filter(i => ((i as any).status||"").toLowerCase()==="done").slice(0,10)
      }
    });
  } catch (e) { next(e); }
});
