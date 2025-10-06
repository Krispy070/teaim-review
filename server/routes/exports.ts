import { Router } from "express";
import { requireProject, getUser } from "../auth/projectAccess";
import { db } from "../db/client";
import { sql } from "drizzle-orm";

function csvEsc(v: any) {
  const s = v === null || v === undefined ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

export const exportsApi = Router();

// Actions CSV
exportsApi.get("/actions.csv", requireProject("member"), async (req, res, next) => {
  try {
    const projectId = String(req.query.projectId || "");
    if (!projectId) return res.status(400).json({ error: "projectId required" });
    const { rows } = await db.execute(sql`
      select id, title, assignee, due_at as "dueAt", priority, status,
             doc_id as "docId", created_at as "createdAt", updated_at as "updatedAt"
      from actions_extracted
      where project_id = ${projectId}
      order by coalesce(due_at, created_at) asc
    `);

    const header = [
      "id","title","assignee","dueAt","priority","status","docId","createdAt","updatedAt"
    ].join(",");

    const lines = rows.map((r: any) => [
      csvEsc(r.id),
      csvEsc(r.title),
      csvEsc(r.assignee ?? ""),
      csvEsc(r.dueAt ?? ""),
      csvEsc(r.priority ?? ""),
      csvEsc(r.status ?? ""),
      csvEsc(r.docId ?? ""),
      csvEsc(r.createdAt ?? ""),
      csvEsc(r.updatedAt ?? "")
    ].join(","));

    const body = [header, ...lines].join("\r\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="actions_project_${projectId}.csv"`);
    res.send(body);
  } catch (e) { next(e); }
});

// Test Cases CSV
exportsApi.get("/tests.csv", requireProject("member"), async (req, res, next) => {
  try {
    const projectId = String(req.query.projectId || "");
    if (!projectId) return res.status(400).json({ error: "projectId required" });

    const { rows } = await db.execute(sql`
      select id, title, steps, expected, priority, tags,
             doc_id as "docId", created_at as "createdAt"
      from test_cases
      where project_id = ${projectId}
      order by created_at desc
    `);

    const header = [
      "id","title","steps","expected","priority","tags","docId","createdAt"
    ].join(",");

    const lines = rows.map((r: any) => [
      csvEsc(r.id),
      csvEsc(r.title),
      csvEsc(Array.isArray(r.steps) ? r.steps.join(" | ") : ""),
      csvEsc(r.expected ?? ""),
      csvEsc(r.priority ?? ""),
      csvEsc(Array.isArray(r.tags) ? r.tags.join(" | ") : ""),
      csvEsc(r.docId ?? ""),
      csvEsc(r.createdAt ?? "")
    ].join(","));

    const body = [header, ...lines].join("\r\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="tests_project_${projectId}.csv"`);
    res.send(body);
  } catch (e) { next(e); }
});

// My Work CSV - personalized actions for current user
exportsApi.get("/mywork.csv", requireProject("member"), async (req, res, next) => {
  try {
    const projectId = String(req.query.projectId || "");
    if (!projectId) return res.status(400).json({ error: "projectId required" });
    
    const u = getUser(req);
    const email = (u?.email || "").toLowerCase();
    const nameLike = email.split("@")[0];

    const { rows } = await db.execute(sql`
      select id, title, assignee, due_at as "dueAt", priority, status,
             doc_id as "docId", created_at as "createdAt", updated_at as "updatedAt"
      from actions_extracted
      where project_id = ${projectId}
        and (coalesce(lower(assignee),'') in (${email}) or coalesce(lower(assignee),'') like ${`%${nameLike}%`})
      order by coalesce(due_at, created_at) asc
    `);

    const header = [
      "id","title","assignee","dueAt","priority","status","docId","createdAt","updatedAt"
    ].join(",");

    const lines = rows.map((r: any) => [
      csvEsc(r.id),
      csvEsc(r.title),
      csvEsc(r.assignee ?? ""),
      csvEsc(r.dueAt ?? ""),
      csvEsc(r.priority ?? ""),
      csvEsc(r.status ?? ""),
      csvEsc(r.docId ?? ""),
      csvEsc(r.createdAt ?? ""),
      csvEsc(r.updatedAt ?? "")
    ].join(","));

    const body = [header, ...lines].join("\r\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="mywork_${email.split("@")[0]}.csv"`);
    res.send(body);
  } catch (e) { next(e); }
});
