import { Router, Request, Response } from "express";
import { db } from "../db/client.js";
import { sql } from "drizzle-orm";
import { requireProject } from "../auth/projectAccess.js";

const router = Router();

router.get("/", requireProject, async (req: Request, res: Response) => {
  try {
    const pid = req.query.projectId as string;
    
    const result = await db.execute(sql`
      SELECT 
        COUNT(*) FILTER(WHERE type IN('Bounce','Complaint')) AS error_24h,
        COUNT(*) FILTER(WHERE type='Bounce') AS bounces,
        COUNT(*) FILTER(WHERE type='Complaint') AS complaints,
        COUNT(*) AS total_events
      FROM email_events
      WHERE project_id = ${pid}
        AND created_at >= NOW() - INTERVAL '24 hours'
    `);
    
    const row = result.rows?.[0] as any;
    const errorCount = Number(row.error_24h || 0);
    const bounces = Number(row.bounces || 0);
    const complaints = Number(row.complaints || 0);
    const total = Number(row.total_events || 0);
    
    const rate = total > 0 ? (errorCount / total) * 100 : 0;
    
    let status = "healthy";
    if (rate >= 5) status = "critical";
    else if (rate >= 2) status = "warning";
    
    res.json({
      ok: true,
      status,
      errorRate: Number(rate.toFixed(2)),
      bounces,
      complaints,
      totalEvents: total,
      last24h: true
    });
  } catch (error: any) {
    console.error("SMTP health check error:", error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
