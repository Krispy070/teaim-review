import { Router } from "express";
import { db } from "../db/client";
export const health = Router();

health.get("/healthz", (_req, res) => res.status(200).json({ ok: true }));

health.get("/readyz", async (_req, res) => {
  try {
    await db.execute("select 1");    // adjust for your db layer
    res.status(200).json({ ready: true });
  } catch (e:any) {
    console.error("[readyz] db error", e?.message || e);
    res.status(503).json({ ready: false, error: "db_unavailable" });
  }
});

export default health;
