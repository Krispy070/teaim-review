import { Router } from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const sftpmock = Router();

function root(host="local"){ const r = path.join("/tmp/sftp", host); fs.mkdirSync(r, { recursive: true }); return r; }
function sha256(buf:Buffer){ return crypto.createHash("sha256").update(buf).digest("hex"); }

sftpmock.post("/sftp/seed", (req, res) => {
  if (process.env.ADAPTER_SANDBOX !== "on")
    return res.status(403).json({ error: "sandbox disabled" });

  const host = String(req.query.host || "local");
  const outDir = path.join(root(host), "out");
  fs.mkdirSync(outDir, { recursive: true });

  const ts = new Date().toISOString().slice(0,19).replace(/[:T]/g,"");
  const name = `sample_${ts}.csv`;
  const csv = "id,value\n1,100\n2,200\n";
  fs.writeFileSync(path.join(outDir, name), csv);
  fs.writeFileSync(path.join(outDir, name + ".sha256"), sha256(Buffer.from(csv)) + "  " + name + "\n");

  res.json({ ok:true, created: [name, name + ".sha256"], host, outDir });
});

sftpmock.post("/sftp/clear", (req, res) => {
  if (process.env.ADAPTER_SANDBOX !== "on")
    return res.status(403).json({ error: "sandbox disabled" });

  const host = String(req.query.host || "local");
  const r = root(host);
  fs.rmSync(r, { recursive: true, force: true });
  fs.mkdirSync(r, { recursive: true });
  res.json({ ok:true, cleared: r });
});
