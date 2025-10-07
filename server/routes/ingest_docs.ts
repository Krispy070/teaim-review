import { Router } from "express";
import { exec } from "../db/exec";
import { clampInt } from "../lib/validate";
import { requireProject } from "../auth/projectAccess";

const docs = Router();

/* GET /api/ingest/list?projectId=&q=&limit=30&offset=0&includeDeleted=0 */
docs.get("/list", requireProject("member"), async (req,res)=>{
  const pid = String(req.query.projectId||"");
  const q   = String(req.query.q||"").toLowerCase();
  const includeDeleted = String(req.query.includeDeleted||"")==="1";
  const limit  = clampInt(req.query.limit, 1, 100, 30);
  const offset = Math.max(0, Number(req.query.offset||"0")|0);

  const where:string[] = [`project_id=$1`]; const params:any[]=[pid];
  if (!includeDeleted) where.push(`deleted_at is null`);
  if (q) { where.push(`lower(coalesce(filename,name,'')) like $${params.length+1}`); params.push(`%${q}%`); }

  const items = (await exec(
    `select id, filename, name, content_type as "mime", size_bytes as "size",
            preview_url as "url", deleted_at as "deletedAt", created_at as "createdAt"
       from docs
      where ${where.join(" and ")}
      order by coalesce(created_at, now()) desc
      limit ${limit} offset ${offset}`, params, 12_000, "docs:list"
  )).rows;

  const filtered = (await exec(
    `select count(*)::int as n from docs where ${where.join(" and ")}`, params, 12_000, "docs:count"
  )).rows?.[0]?.n || 0;

  res.json({ ok:true, items, meta:{ limit, offset, filtered } });
});

/* POST /api/ingest/delete { projectId, id } (soft) */
docs.post("/delete", requireProject("member"), async (req,res)=>{
  const { projectId, id } = req.body||{};
  if (!projectId || !id) return res.status(400).json({ error:"projectId & id required" });
  await exec(`update docs set deleted_at=now() where id=$1 and project_id=$2`, [id, projectId], 12_000, "docs:soft-delete");
  res.json({ ok:true });
});

/* POST /api/ingest/restore { projectId, id } */
docs.post("/restore", requireProject("member"), async (req,res)=>{
  const { projectId, id } = req.body||{};
  if (!projectId || !id) return res.status(400).json({ error:"projectId & id required" });
  await exec(`update docs set deleted_at=null where id=$1 and project_id=$2`, [id, projectId], 12_000, "docs:restore");
  res.json({ ok:true });
});

export default docs;
