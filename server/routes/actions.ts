import { Router } from "express";
import { db } from "../db/client";
import { requireProject, assertProjectAccess } from "../auth/projectAccess";
import { sql } from "drizzle-orm";

export const actionsApi = Router();

actionsApi.get("/list", requireProject("member"), async (req, res, next) => {
  try {
    const { projectId, includeArchived, originType } = req.query as any;
    if (!projectId) return res.status(400).json({ error: "projectId required" });
    
    const where = [sql`project_id = ${projectId}`];
    const shouldIncludeArchived = String(includeArchived).toLowerCase() === "true";
    if (!shouldIncludeArchived) where.push(sql`archived_at is null`);
    if (originType && originType !== 'all') {
      where.push(sql`origin_type = ${originType}`);
    }
    const { rows } = await db.execute(
      sql`select id, title, assignee, due_at as "dueAt", priority, status, confidence, source, doc_id as "docId",
              created_at as "createdAt", updated_at as "updatedAt", archived_at as "archivedAt",
              origin_type as "originType", origin_id as "originId"
       from actions_extracted where ${sql.join(where, sql` and `)} order by coalesce(due_at, created_at) asc limit 500`
    );
    res.json({ ok: true, items: rows || [] });
  } catch (e) { next(e); }
});

actionsApi.get("/:id", async (req, res, next) => {
  try {
    const id = String(req.params.id || "");
    const { rows } = await db.execute(
      sql`select id, project_id as "projectId", title, assignee, due_at as "dueAt",
              priority, status, source, created_at as "createdAt", updated_at as "updatedAt"
         from actions_extracted where id=${id} limit 1`
    );
    if (!rows?.length) return res.status(404).json({ error: "not found" });
    
    // Verify project access before returning action details
    await assertProjectAccess(req, rows[0].projectId, "member");
    
    res.json({ ok: true, item: rows[0] });
  } catch (e) { next(e); }
});

actionsApi.patch("/:id", async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const { rows: proj } = await db.execute(sql`select project_id as "projectId" from actions_extracted where id=${id}`);
    if (!proj?.length) return res.status(404).json({ error: "not found" });
    await assertProjectAccess(req, proj[0].projectId, "member");

    const { title, assignee, dueAt, priority, status } = req.body || {};
    const updates: any[] = [sql`updated_at = now()`];
    if (title !== undefined) updates.push(sql`title = ${title}`);
    if (assignee !== undefined) updates.push(sql`assignee = ${assignee}`);
    if (dueAt !== undefined) updates.push(sql`due_at = ${dueAt || null}`);
    if (priority !== undefined) updates.push(sql`priority = ${priority}`);
    if (status !== undefined) updates.push(sql`status = ${status}`);

    await db.execute(sql`update actions_extracted set ${sql.join(updates, sql`, `)} where id = ${id}`);
    
    // Sync playbook item if linked
    if (status !== undefined) {
      await db.execute(sql`update playbook_items set status=${status}, updated_at=now() where action_id=${id}`);
    }
    
    res.json({ ok: true });
  } catch (e) { next(e); }
});

actionsApi.post("/:id/complete", async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const { rows: proj } = await db.execute(sql`select project_id as "projectId" from actions_extracted where id=${id}`);
    if (!proj?.length) return res.status(404).json({ error: "not found" });
    await assertProjectAccess(req, proj[0].projectId, "member");
    await db.execute(sql`update actions_extracted set status='done', updated_at=now() where id=${id}`);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

actionsApi.post("/:id/archive", async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const { rows: proj } = await db.execute(sql`select project_id as "projectId" from actions_extracted where id=${id}`);
    if (!proj?.length) return res.status(404).json({ error: "not found" });
    await assertProjectAccess(req, proj[0].projectId, "admin");
    await db.execute(sql`update actions_extracted set archived_at=now(), status='archived', updated_at=now() where id=${id}`);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

actionsApi.post("/bulk", requireProject("member"), async (req, res, next) => {
  try {
    const { projectId, ids, set } = req.body || {};
    if (!projectId || !Array.isArray(ids) || !ids.length) return res.status(400).json({ error: "projectId & ids required" });

    const { rows } = await db.execute(
      sql`select id from actions_extracted where project_id=${projectId} and id = any(${ids}::uuid[])`
    );
    if (!rows?.length) return res.json({ ok: true, updated: 0 });

    const updates: any[] = [sql`updated_at=now()`];
    if (set?.assignee !== undefined) updates.push(sql`assignee = ${set.assignee || null}`);
    if (set?.dueAt !== undefined) updates.push(sql`due_at = ${set.dueAt || null}`);
    if (set?.priority !== undefined) updates.push(sql`priority = ${set.priority}`);
    if (set?.status !== undefined) updates.push(sql`status = ${set.status}`);

    const rowIds = rows.map((r:any)=>r.id);
    await db.execute(sql`update actions_extracted set ${sql.join(updates, sql`, `)} where id = any(${rowIds}::uuid[])`);
    res.json({ ok: true, updated: rows.length });
  } catch (e) { next(e); }
});
