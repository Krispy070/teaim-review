import { Router } from "express";
import multer from "multer";
import mammoth from "mammoth";
import fs from "node:fs";
import path from "node:path";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { requireProject } from "../auth/projectAccess";

export const specs = Router();
const upload = multer();
const DIR = "/tmp/specs"; if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive:true });

specs.get("/:integrationId/list", requireProject("member"), async (req,res)=>{
  const iid = String(req.params.integrationId||"");
  const { rows } = await db.execute(
    sql`select id, name, content_type as "contentType", url, created_at as "createdAt"
       from integration_specs where integration_id=${iid} order by created_at desc`);
  res.json({ ok:true, items: rows||[] });
});

specs.post("/:integrationId/upload", requireProject("member"), upload.single("file"), async (req,res)=>{
  const iid = String(req.params.integrationId||"");
  const { projectId, url, name } = req.body || {};
  if (!projectId) return res.status(400).json({ error:"projectId required" });

  if (url) {
    const nm = name || url.split("/").slice(-1)[0];
    const { rows } = await db.execute(
      sql`insert into integration_specs (project_id, integration_id, name, url, uploaded_by)
       values (${projectId},${iid},${nm},${url},${(req as any).user?.email||null}) returning id`
    );
    return res.json({ ok:true, id: (rows?.[0] as any)?.id });
  }

  if (!req.file) return res.status(400).json({ error:"file or url required" });
  const id = crypto.randomUUID?.() || require("node:crypto").randomUUID();
  const filename = `${id}_${req.file.originalname}`.replace(/[^\w.\-]+/g,"_");
  const full = path.join(DIR, filename);
  fs.writeFileSync(full, req.file.buffer);
  await db.execute(
    sql`insert into integration_specs (id, project_id, integration_id, name, storage_path, content_type, uploaded_by)
     values (${id},${projectId},${iid},${req.file.originalname},${full},${req.file.mimetype||"application/octet-stream"},${(req as any).user?.email||null})`
  );
  res.json({ ok:true, id });
});

specs.delete("/:id", requireProject("member"), async (req,res)=>{
  const id = String(req.params.id||"");
  const { rows } = await db.execute(sql`select storage_path as "storagePath" from integration_specs where id=${id}`);
  const row = rows?.[0] as any;
  if (row?.storagePath && fs.existsSync(row.storagePath)) fs.unlinkSync(row.storagePath);
  await db.execute(sql`delete from integration_specs where id=${id}`);
  res.json({ ok:true });
});

specs.get("/:id/preview", requireProject("member"), async (req,res)=>{
  const id = String(req.params.id||"");
  const { rows } = await db.execute(
    sql`select name, storage_path as "storagePath", content_type as "contentType", url
       from integration_specs where id=${id}`);
  const s = rows?.[0] as any; if (!s) return res.status(404).send("Not found");

  if (s.url) return res.redirect(s.url);

  if ((s.contentType||"").includes("pdf") && s.storagePath) {
    res.setHeader("Content-Type","application/pdf");
    res.setHeader("Content-Disposition",`inline; filename="${s.name}"`);
    return fs.createReadStream(s.storagePath).pipe(res);
  }

  if (s.storagePath && (s.contentType||"").includes("officedocument.wordprocessingml")) {
    const buf = fs.readFileSync(s.storagePath);
    const { value: html } = await mammoth.convertToHtml({ buffer: buf });
    return res
      .status(200).type("text/html")
      .send(`<!doctype html><html><head><meta charset="utf-8"><title>${s.name}</title></head><body>${html}</body></html>`);
  }

  if (s.storagePath) {
    res.setHeader("Content-Type", s.contentType||"application/octet-stream");
    res.setHeader("Content-Disposition",`attachment; filename="${s.name}"`);
    return fs.createReadStream(s.storagePath).pipe(res);
  }

  res.status(404).send("No content");
});
