import type { Request, Response, NextFunction } from "express";
import { db } from "../db/client";
import crypto from "node:crypto";
import { sql } from "drizzle-orm";

function sha256hex(s: string) {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

/**
 * Accepts Bearer tokens of form:  teaim_<prefix>_<secret>
 * - Looks up by <prefix>, compares sha256(secret) to keyHash
 * - Rejects if revoked or expired
 * - Attaches req.apiKey = { projectId, scopes, id, name }
 */
export async function apiKeyAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const h = req.headers["authorization"] || "";
    if (typeof h !== "string" || !h.toLowerCase().startsWith("bearer ")) return next();
    const token = h.slice(7).trim();

    if (!token.startsWith("teaim_")) return next();
    const parts = token.split("_");
    if (parts.length < 3) return next();

    const prefix = parts[1];
    const secret = parts.slice(2).join("_");
    const sh = sha256hex(secret);

    const { rows } = await db.execute(
      sql`select id, project_id as "projectId", name, key_hash as "keyHash", scopes, expires_at as "expiresAt", revoked_at as "revokedAt"
         from api_keys where prefix=${prefix} limit 1`
    );
    const row = rows?.[0];
    if (!row) return next();

    if (row.revokedAt) return next();
    if (row.expiresAt && new Date(String(row.expiresAt)) < new Date()) return next();
    if (row.keyHash !== sh) return next();

    (req as any).apiKey = { id: row.id, projectId: row.projectId, name: row.name, scopes: row.scopes || [] };
    await db.execute(sql`update api_keys set last_used_at = now() where id=${row.id}`);
    return next();
  } catch {
    return next();
  }
}
