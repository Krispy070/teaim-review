import { Router } from "express";
import fs from "node:fs";
import path from "node:path";

export const info = Router();

function readPkgVersion() {
  try {
    const p = path.resolve(process.cwd(), "package.json");
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    return j?.version || "0.0.0";
  } catch { return "0.0.0"; }
}

info.get("/info", (_req, res) => {
  const version = process.env.APP_VERSION || readPkgVersion();
  const commit  = process.env.GIT_COMMIT || "";
  const started = Number(process.env.PROC_STARTED_AT || `${Math.floor(Date.now()/1000)}`);
  const uptimeS = Math.max(0, Math.floor(Date.now()/1000) - started);
  res.json({
    ok: true,
    version,
    commit,
    node: process.version,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    uptimeSec: uptimeS,
    env: (process.env.NODE_ENV || "development")
  });
});

info.get("/time", (_req, res) => {
  res.json({ ok:true, now: new Date().toISOString() });
});

export default info;
