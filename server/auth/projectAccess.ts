import type { Request, Response, NextFunction } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";

function rank(r: string) { 
  return r === "owner" ? 5 : r === "admin" ? 4 : r === "pm" ? 3 : r === "lead" ? 2 : r === "member" ? 1 : r === "viewer" ? 0 : r === "guest" ? 0 : 0; 
}

export function getUser(req: Request) {
  return (req as any).user as { sub?: string; email?: string; app_metadata?: any } | null;
}

export function getApiKey(req: Request) {
  return (req as any).apiKey as { id:string; projectId:string; scopes:string[] } | null;
}

export function getProjectIdFromReq(req: Request): string | null {
  const q = (req.query?.projectId as string) || (req.body?.projectId as string) || (req.query?.project_id as string) || (req.body?.project_id as string);
  return q || null;
}

export async function checkMembership(userSub: string | undefined, email: string | undefined, projectId: string) {
  if (!userSub && !email) return null;
  const userId = userSub || email || "";
  const result: any = await db.execute(sql`
    SELECT role FROM project_members 
    WHERE project_id = ${projectId} AND user_id = ${userId}
    LIMIT 1
  `);
  const rows = result.rows || result;
  return rows?.[0]?.role || null;
}

export function requireProject(level: "guest"|"viewer"|"member"|"lead"|"pm"|"admin"|"owner" = "member") {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = getUser(req);
    const key  = getApiKey(req);
    const projectId = getProjectIdFromReq(req);
    if (!projectId) return res.status(400).json({ error: "projectId required" });

    // API key path: must match project & have appropriate scope
    if (key && key.projectId === projectId) {
      const scopes = key.scopes || [];
      const needsAdmin = (rank(level) >= rank("admin"));
      const needsWrite = (rank(level) >= rank("member"));
      
      // Admin-level routes require project:write or keys:manage
      if (needsAdmin) {
        if (scopes.includes("project:write") || scopes.includes("keys:manage")) return next();
        return res.status(403).json({ error: "forbidden: admin scope required" });
      }
      
      // Write-level routes require ingest:write or project:write
      if (needsWrite) {
        if (scopes.includes("ingest:write") || scopes.includes("project:write")) return next();
        return res.status(403).json({ error: "forbidden: write scope required" });
      }
      
      // Read-only access allowed for any valid key
      return next();
    }

    // Fallback to user-based membership
    if (!user) return res.status(401).json({ error: "unauthorized" });

    // global admin override
    const globalRole = user.app_metadata?.user_role;
    if (globalRole === "admin" || globalRole === "owner") return next();

    const memberRole = await checkMembership(user.sub, user.email, projectId);
    if (!memberRole) return res.status(403).json({ error: "forbidden: not a project member" });

    if (rank(memberRole) < rank(level)) return res.status(403).json({ error: `forbidden: need ${level}` });
    next();
  };
}

// Helper for routes where you look up projectId by docId first:
export async function assertProjectAccess(req: Request, projectId: string, level: "guest"|"viewer"|"member"|"lead"|"pm"|"admin"|"owner" = "member") {
  const user = getUser(req);
  if (!user) throw Object.assign(new Error("unauthorized"), { status: 401 });
  const globalRole = user.app_metadata?.user_role;
  if (globalRole === "admin" || globalRole === "owner") return;
  const memberRole = await checkMembership(user.sub, user.email, projectId);
  if (!memberRole) throw Object.assign(new Error("forbidden"), { status: 403 });
  if (rank(memberRole) < rank(level)) throw Object.assign(new Error("forbidden"), { status: 403 });
}
