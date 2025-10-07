import { Router } from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { requireProject } from "../auth/projectAccess";

export const runArt = Router();
const upload = multer();
const DIR = "/tmp/run-artifacts";
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });

runArt.get("/:runId/list", requireProject("member"), async (req, res) => {
  const rid = String(req.params.runId || "");
  const pid = req.body.projectId || req.query.projectId || (req as any).projectId;
  
  const { rows: runCheck } = await db.execute(
    sql`select project_id from integration_runs where id=${rid}`
  );
  if (!runCheck?.[0] || (runCheck[0] as any).project_id !== pid) {
    return res.status(404).json({ error: "Run not found or access denied" });
  }
  
  const { rows } = await db.execute(
    sql`select id, name, url, content_type as "contentType", created_at as "createdAt"
       from integration_run_artifacts where run_id=${rid} order by created_at desc`
  );
  res.json({ ok: true, items: rows || [] });
});

runArt.post("/:runId/upload", requireProject("member"), upload.single("file"), async (req, res) => {
  const rid = String(req.params.runId || "");
  const clientPid = req.body.projectId || req.query.projectId || (req as any).projectId;
  
  const { rows: runCheck } = await db.execute(
    sql`select project_id from integration_runs where id=${rid}`
  );
  if (!runCheck?.[0]) {
    return res.status(404).json({ error: "Run not found" });
  }
  const projectId = (runCheck[0] as any).project_id;
  
  if (projectId !== clientPid) {
    return res.status(403).json({ error: "Access denied" });
  }

  const { url, name } = req.body || {};
  
  if (url) {
    const nm = name || url.split("/").slice(-1)[0];
    const ins = await db.execute(
      sql`insert into integration_run_artifacts (project_id, run_id, url, name)
       values (${projectId}, ${rid}, ${url}, ${nm}) returning id`
    );
    return res.json({ ok: true, id: ins.rows?.[0]?.id });
  }

  if (!req.file) return res.status(400).json({ error: "file or url required" });
  const id = (global as any).crypto?.randomUUID?.() || require("node:crypto").randomUUID();
  const safe = `${id}_${req.file.originalname}`.replace(/[^\w.\-]+/g, "_");
  const full = path.join(DIR, safe);
  fs.writeFileSync(full, req.file.buffer);
  const fname = req.file.originalname;
  const ctype = req.file.mimetype || "application/octet-stream";
  await db.execute(
    sql`insert into integration_run_artifacts (id, project_id, run_id, name, storage_path, content_type)
     values (${id}, ${projectId}, ${rid}, ${fname}, ${full}, ${ctype})`
  );
  res.json({ ok: true, id });
});

runArt.delete("/:id", requireProject("member"), async (req, res) => {
  const id = String(req.params.id || "");
  const pid = req.body.projectId || req.query.projectId || (req as any).projectId;
  
  const { rows } = await db.execute(
    sql`select storage_path as "storagePath", project_id from integration_run_artifacts where id=${id}`
  );
  const artifact = rows?.[0] as any;
  
  if (!artifact) {
    return res.status(404).json({ error: "Artifact not found" });
  }
  
  if (artifact.project_id !== pid) {
    return res.status(403).json({ error: "Access denied" });
  }
  
  const p = artifact.storagePath;
  if (p && fs.existsSync(p)) fs.unlinkSync(p);
  await db.execute(sql`delete from integration_run_artifacts where id=${id}`);
  res.json({ ok: true });
});

runArt.get("/preview/:id", requireProject("member"), async (req, res) => {
  const id = String(req.params.id || "");
  const pid = req.body.projectId || req.query.projectId || (req as any).projectId;
  
  const { rows } = await db.execute(
    sql`select name, storage_path as "storagePath", content_type as "contentType", url, project_id
       from integration_run_artifacts where id=${id}`
  );
  const a = rows?.[0] as any;
  
  if (!a) {
    return res.status(404).send("Not found");
  }
  
  if (a.project_id !== pid) {
    return res.status(403).send("Access denied");
  }
  
  if (a.url) return res.redirect(a.url);
  if (a.storagePath) {
    res.setHeader("Content-Type", a.contentType || "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${a.name}"`);
    return fs.createReadStream(a.storagePath).pipe(res);
  }
  res.status(404).send("No content");
});
