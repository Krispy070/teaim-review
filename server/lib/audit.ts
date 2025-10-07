import { sql } from "drizzle-orm";
import { db } from "../db/client";
import { getUser } from "../auth/projectAccess";

export async function logAudit(req: any, projectId: string, action: string, entity: string, entityId?: string, changes?: any) {
  try {
    const u = getUser(req) || {};
    await db.execute(sql`
      insert into audit_log (project_id, user_id, user_email, action, entity, entity_id, route, changes)
      values (${projectId}, ${(u as any).sub || null}, ${(u as any).email || null}, ${action}, ${entity}, ${entityId || null}, ${req.path || ""}, ${changes || {}}::jsonb)
    `);
  } catch (e) {
    console.error("[audit] failed", e);
  }
}
