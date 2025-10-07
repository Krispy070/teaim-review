import { Router } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { exec } from "../db/exec";
import { requireRole } from "../auth/supabaseAuth";
import { requireProject } from "../auth/projectAccess";
import { requireProjectId } from "../auth/guards";
import { asyncHandler } from "../middleware/errorHandler";
import { isUUID } from "../lib/validate";
import { z } from "zod";

export const reset = Router();

const resetSchema = z.object({
  projectId: z.string().uuid(),
  dropCohorts: z.boolean().optional().default(false),
  dryRun: z.boolean().optional().default(true),
});

/* POST /api/admin/sandbox/reset
 * { projectId, dropCohorts?:boolean, dryRun?:boolean }
 */
reset.post("/reset", requireRole("admin"), requireProject("admin"), requireProjectId(), asyncHandler(async (req, res) => {
  // Validate request body
  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
  }

  const { projectId, dropCohorts, dryRun } = parsed.data;

  // Additional UUID check using validation helper
  if (!isUUID(projectId)) {
    return res.status(400).json({ error: "invalid_project_id" });
  }

  // Build list of tables to clear
  const tables = [
    "plan_tasks",
    "actions", 
    "decisions",
    "risks",
    "timeline_events",
    "tickets",
    "test_cases",
    "meetings",
    "conversations",
    "email_events",
    "offboarding_rows",
    "separation_events",
  ];
  
  if (dropCohorts) {
    tables.push("cohorts");
  }

  // For dry run, show query text
  if (dryRun) {
    const stmtTexts = tables.map(t => `DELETE FROM ${t} WHERE project_id = '${projectId}'`);
    stmtTexts.push(`UPDATE docs SET deleted_at = NOW() WHERE project_id = '${projectId}'`);
    return res.json({ 
      ok: true, 
      dryRun: true, 
      stmts: stmtTexts, 
      note: "Set dryRun=false to apply." 
    });
  }

  try {
    // Execute safe parameterized queries using exec wrapper for better logging
    for (const table of tables) {
      await exec(
        `DELETE FROM ${table} WHERE project_id = $1`,
        [projectId], 30_000, `reset:${table}`
      );
    }
    
    // Soft-delete docs
    await exec(
      `UPDATE docs SET deleted_at = NOW() WHERE project_id = $1`,
      [projectId], 30_000, "reset:docs"
    );
    
    return res.json({ ok: true, applied: tables.length + 1 });
  } catch (e: any) {
    console.error("[sandbox reset]", e?.message || e);
    return res.status(500).json({ 
      error: "reset_failed", 
      detail: String(e?.message || e) 
    });
  }
}));

export default reset;
