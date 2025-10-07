import { Router } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";

export const wh = Router();

/* GET /api/workers/health */
wh.get("/health", async (_req, res) => {
  const rows = (await db.execute(
    sql`select name, last_run_at as "lastRunAt", ok, note from worker_heartbeats order by name`
  )).rows || [];
  res.json({ ok: true, items: rows });
});

/* POST /api/workers/trigger  { name } — SAFE workers only */
wh.post("/trigger", async (req, res) => {
  const { name } = req.body || {};
  const safe = new Set(["conversationSweep", "planTicketSync", "onboardingDigest", "offboardingWeekly"]);
  if (!safe.has(name)) return res.status(400).json({ error: "not triggerable" });

  // lightweight poke: write a beat (UI shows it) — your long workers run on interval anyway
  await db.execute(
    sql`insert into worker_heartbeats (name, last_run_at, ok, note)
     values (${name}, now(), true, 'manual trigger')
     on conflict (name) do update set last_run_at=now(), ok=true, note='manual trigger'`
  );
  res.json({ ok: true });
});

export default wh;
