import { Router } from "express";
import { db } from "../db/client";
import { assertProjectAccess } from "../auth/projectAccess";
import { sql } from "drizzle-orm";

export const docsApi = Router();

docsApi.get("/chunks", async (req, res, next) => {
  try {
    const docId = req.query.docId as string;
    if (!docId) return res.status(400).json({ error: "docId required" });

    const projectResult = await db.execute(sql`select project_id as "projectId" from docs where id = ${docId}`);
    const p = (projectResult as any).rows || projectResult;
    if (!p?.length) return res.status(404).json({ error: "not found" });
    await assertProjectAccess(req, p[0].projectId, "viewer");

    const chunksResult = await db.execute(sql`
      select id, chunk_index as "chunkIndex", chunk
      from doc_chunks where doc_id = ${docId} order by chunk_index asc
    `);
    const rows = (chunksResult as any).rows || chunksResult;
    res.json({ ok: true, chunks: rows || [] });
  } catch (e) { next(e); }
});
