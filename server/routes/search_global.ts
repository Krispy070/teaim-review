import { Router } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { requireProject } from "../auth/projectAccess";
import { generateEmbeddings } from "../lib/embed";

export const gsearch = Router();

gsearch.get("/", requireProject("member"), async (req, res) => {
  const q = String(req.query.q||"").trim();
  const pid = String(req.query.projectId||"");
  const limit = Math.min(25, Math.max(1, Number(req.query.limit||"10")));
  const offset= Math.max(0, Number(req.query.offset||"0"));
  if (!q || !pid) return res.status(400).json({ error:"q & projectId required" });

  let docs:any[] = [];
  try {
    const [qvec] = await generateEmbeddings([q]);
    const lit = "[" + qvec.join(",") + "]";
    const { rows } = await db.execute(
      sql`select d.id, d.name, (1 - (dc.embedding_vec <=> ${sql.raw(lit)}::vector)) as score
         from doc_chunks dc
    left join docs d on d.id = dc.doc_id
        where dc.project_id=${pid} and dc.embedding_vec is not null
        group by d.id, d.name, dc.embedding_vec, dc.doc_id
        order by dc.embedding_vec <=> ${sql.raw(lit)}::vector
        limit ${limit} offset ${offset}`
    );
    docs = rows || [];
  } catch { docs = []; }

  const like = `%${q.replace(/%/g,"").replace(/_/g,"").toLowerCase()}%`;

  const [ints, iss, acts, rsk] = await Promise.all([
    db.execute(
      sql`select id, name, status, owner from integrations where project_id=${pid} and lower(name) like ${like} order by created_at desc limit ${limit} offset ${offset}`
    ),
    db.execute(
      sql`select id, title, status, priority from integration_issues where project_id=${pid} and (lower(title) like ${like} or lower(description) like ${like}) order by created_at desc limit ${limit} offset ${offset}`
    ),
    db.execute(
      sql`select id, title, status, priority, due_at as "dueAt" from actions where project_id=${pid} and lower(title) like ${like} order by created_at desc limit ${limit} offset ${offset}`
    ),
    db.execute(
      sql`select id, title, status, severity from risks where project_id=${pid} and (lower(title) like ${like} or lower(description) like ${like}) order by created_at desc limit ${limit} offset ${offset}`
    ),
  ]);

  res.json({
    ok: true,
    docs,
    integrations: ints.rows||[],
    issues: iss.rows||[],
    actions: acts.rows||[],
    risks: rsk.rows||[],
    meta: { limit, offset, q }
  });
});
