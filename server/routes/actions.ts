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
      `select id, project_id as "projectId", title, assignee, due_at as "dueAt",
              priority, status, source, created_at as "createdAt", updated_at as "updatedAt"
         from actions_extracted where id=$1 limit 1`,
      [id] as any
    );
    if (!rows?.length) return res.status(404).json({ error: "not found" });
    
    // Verify project access before returning action details
    await assertProjectAccess(req, rows[0].projectId, "member");
    
    res.json({ ok: true, item: rows[0] });
  } catch (e) { next(e); }
});

actionsApi.patch("/:id", async (req, res, next) => {
  try {
    const id = req.params.id;
    const { rows: proj } = await db.execute(`select project_id as "projectId" from actions_extracted where id=$1`, [id] as any);
    if (!proj?.length) return res.status(404).json({ error: "not found" });
    await assertProjectAccess(req, proj[0].projectId, "member");

    const { title, assignee, dueAt, priority, status } = req.body || {};
    const sets = [`updated_at = now()`]; const params: any[] = [];
    function set(col: string, val: any) { params.push(val); sets.push(`${col} = $${params.length}`); }
    if (title !== undefined) set("title", title);
    if (assignee !== undefined) set("assignee", assignee);
    if (dueAt !== undefined) set("due_at", dueAt || null);
    if (priority !== undefined) set("priority", priority);
    if (status !== undefined) set("status", status);

    await db.execute(`update actions_extracted set ${sets.join(", ")} where id = $${params.length + 1}`, [...params, id] as any);
    
    // Sync playbook item if linked
    if (status !== undefined) {
      await db.execute(
        `update playbook_items set status=$1, updated_at=now() where action_id=$2`,
        [status, id] as any
      );
    }
    
    res.json({ ok: true });
  } catch (e) { next(e); }
});

actionsApi.post("/:id/complete", async (req, res, next) => {
  try {
    const id = req.params.id;
    const { rows: proj } = await db.execute(`select project_id as "projectId" from actions_extracted where id=$1`, [id] as any);
    if (!proj?.length) return res.status(404).json({ error: "not found" });
    await assertProjectAccess(req, proj[0].projectId, "member");
    await db.execute(`update actions_extracted set status='done', updated_at=now() where id=$1`, [id] as any);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

actionsApi.post("/:id/archive", async (req, res, next) => {
  try {
    const id = req.params.id;
    const { rows: proj } = await db.execute(`select project_id as "projectId" from actions_extracted where id=$1`, [id] as any);
    if (!proj?.length) return res.status(404).json({ error: "not found" });
    await assertProjectAccess(req, proj[0].projectId, "admin");
    await db.execute(`update actions_extracted set archived_at=now(), status='archived', updated_at=now() where id=$1`, [id] as any);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

actionsApi.post("/bulk", requireProject("member"), async (req, res, next) => {
  try {
    const { projectId, ids, set } = req.body || {};
    if (!projectId || !Array.isArray(ids) || !ids.length) return res.status(400).json({ error: "projectId & ids required" });

    const { rows } = await db.execute(
      `select id from actions_extracted where project_id=$1 and id = any($2::uuid[])`,
      [projectId, ids] as any
    );
    if (!rows?.length) return res.json({ ok: true, updated: 0 });

    const sets = [`updated_at=now()`]; const params: any[] = [];
    function put(col: string, v: any) { params.push(v); sets.push(`${col}=$${params.length}`); }
    if (set?.assignee !== undefined) put("assignee", set.assignee || null);
    if (set?.dueAt !== undefined) put("due_at", set.dueAt || null);
    if (set?.priority !== undefined) put("priority", set.priority);
    if (set?.status !== undefined) put("status", set.status);

    params.push(rows.map((r:any)=>r.id));
    await db.execute(`update actions_extracted set ${sets.join(", ")} where id = any($${params.length})`, params as any);
    res.json({ ok: true, updated: rows.length });
  } catch (e) { next(e); }
});
