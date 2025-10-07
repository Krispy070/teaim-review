import { Router } from "express";
import { db } from "../db/client";
import { requireProject } from "../auth/projectAccess";
import { sql } from "drizzle-orm";
import crypto from "node:crypto";

export const keys = Router();

function sha256hex(s: string) {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}
function rand(n=26) {
  return crypto.randomBytes(Math.ceil(n/2)).toString("hex").slice(0,n);
}

// POST /api/keys/create { projectId, name, scopes?, expiresAt? }
keys.post("/create", requireProject("admin"), async (req, res) => {
  const { projectId, name, scopes = ["ingest:write"], expiresAt } = req.body || {};
  if (!projectId || !name) return res.status(400).json({ error: "projectId & name required" });

  const prefix = rand(6);
  const secret = rand(48);
  const token = `teaim_${prefix}_${secret}`;
  const hash = sha256hex(secret);

  const email = (req as any).user?.email || null;
  await db.execute(
    sql`insert into api_keys (project_id, name, prefix, key_hash, scopes, created_by_email, expires_at)
     values (${projectId},${name},${prefix},${hash},${JSON.stringify(scopes)},${email},${expiresAt || null})`
  );
  res.json({ ok:true, token, prefix, scopes, expiresAt: expiresAt || null });
});

// GET /api/keys/list?projectId=
keys.get("/list", requireProject("admin"), async (req, res) => {
  const pid = String(req.query.projectId||"");
  const { rows } = await db.execute(
    sql`select id, name, prefix, scopes, created_by_email as "createdByEmail",
            last_used_at as "lastUsedAt", expires_at as "expiresAt", revoked_at as "revokedAt", created_at as "createdAt"
       from api_keys where project_id=${pid} order by created_at desc`
  );
  res.json({ ok:true, items: rows||[] });
});

// POST /api/keys/revoke { id, projectId }
keys.post("/revoke", requireProject("admin"), async (req, res) => {
  const { id, projectId } = req.body || {};
  if (!id) return res.status(400).json({ error:"id required" });
  if (!projectId) return res.status(400).json({ error:"projectId required" });
  
  // Verify key belongs to this project before revoking
  const check = await db.execute(sql`select id from api_keys where id=${id} and project_id=${projectId} limit 1`);
  if (!check.rows?.length) return res.status(404).json({ error:"key not found or access denied" });
  
  await db.execute(sql`update api_keys set revoked_at=now() where id=${id} and project_id=${projectId}`);
  res.json({ ok:true });
});

// POST /api/keys/rotate { id, projectId }
keys.post("/rotate", requireProject("admin"), async (req, res) => {
  const { id, projectId } = req.body || {};
  if (!id) return res.status(400).json({ error:"id required" });
  if (!projectId) return res.status(400).json({ error:"projectId required" });

  // Verify key belongs to this project before rotating
  const check = await db.execute(sql`select id from api_keys where id=${id} and project_id=${projectId} limit 1`);
  if (!check.rows?.length) return res.status(404).json({ error:"key not found or access denied" });

  const prefix = rand(6);
  const secret = rand(48);
  const token = `teaim_${prefix}_${secret}`;
  const hash = sha256hex(secret);

  await db.execute(sql`update api_keys set prefix=${prefix}, key_hash=${hash}, revoked_at=null, updated_at=now() where id=${id} and project_id=${projectId}`);
  res.json({ ok:true, token, prefix });
});
