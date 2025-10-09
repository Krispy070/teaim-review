import { db } from "../db/client";
import { sql } from "drizzle-orm";
import fetch from "node-fetch";
import { handleWorkerError, workersDisabled } from "./utils";

export function startDailyBriefWorker() {
  setInterval(async () => {
    if (workersDisabled()) return;
    try {
      const now = new Date();
      if (now.getUTCHours() !== 6 || now.getUTCMinutes() < 30 || now.getUTCMinutes() > 34) return;
      const { rows: projects } = await db.execute(sql`select id from projects`);
      for (const p of projects || []) {
        await fetch(`http://localhost:${process.env.PORT || 5000}/api/briefs/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: (p as any).id }),
        }).catch(() => {});
      }
    } catch (error) {
      handleWorkerError("dailyBriefWorker", error);
    }
  }, 60_000);
}
