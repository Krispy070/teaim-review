import { Router } from "express";
import { requireRole } from "../auth/supabaseAuth";
import { db } from "../db/client";
import { sql } from "drizzle-orm";

export const insights = Router();

insights.get("/timeline", requireRole("member"), async (req, res, next) => {
  try {
    const projectId = req.query.projectId as string;
    if (!projectId) return res.status(400).json({ error: "projectId required" });
    
    const result: any = await db.execute(sql`
      SELECT id, title, type, starts_at as "startsAt", ends_at as "endsAt", confidence, source, doc_id as "docId"
      FROM timeline_events 
      WHERE project_id = ${projectId}
      ORDER BY COALESCE(starts_at, created_at) ASC 
      LIMIT 500
    `);
    
    const rows = result.rows || result;
    res.json({ ok: true, items: rows || [] });
  } catch (e: any) {
    next(e);
  }
});

insights.get("/actions", requireRole("member"), async (req, res, next) => {
  try {
    const projectId = req.query.projectId as string;
    if (!projectId) return res.status(400).json({ error: "projectId required" });
    
    const result: any = await db.execute(sql`
      SELECT id, title, assignee, due_at as "dueAt", priority, status, confidence, source, doc_id as "docId"
      FROM actions_extracted 
      WHERE project_id = ${projectId}
      ORDER BY COALESCE(due_at, created_at) ASC 
      LIMIT 500
    `);
    
    const rows = result.rows || result;
    res.json({ ok: true, items: rows || [] });
  } catch (e: any) {
    next(e);
  }
});

insights.get("/decisions", requireRole("member"), async (req, res, next) => {
  try {
    const projectId = req.query.projectId as string;
    if (!projectId) return res.status(400).json({ error: "projectId required" });
    
    const result: any = await db.execute(sql`
      SELECT id, decision, decided_by as "decidedBy", decided_at as "decidedAt", rationale, confidence, source, doc_id as "docId"
      FROM decisions_extracted 
      WHERE project_id = ${projectId}
      ORDER BY COALESCE(decided_at, created_at) DESC 
      LIMIT 500
    `);
    
    const rows = result.rows || result;
    res.json({ ok: true, items: rows || [] });
  } catch (e: any) {
    next(e);
  }
});

insights.get("/tests", requireRole("member"), async (req, res, next) => {
  try {
    const projectId = req.query.projectId as string;
    if (!projectId) return res.status(400).json({ error: "projectId required" });
    
    const result: any = await db.execute(sql`
      SELECT id, title, steps, expected, priority, tags, confidence, source, doc_id as "docId"
      FROM test_cases 
      WHERE project_id = ${projectId}
      ORDER BY created_at DESC 
      LIMIT 500
    `);
    
    const rows = result.rows || result;
    res.json({ ok: true, items: rows || [] });
  } catch (e: any) {
    next(e);
  }
});
