import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import mammoth from "mammoth";
import { db } from "../db/client";
import { assertProjectAccess } from "../auth/projectAccess";
import { sql } from "drizzle-orm";

export const docsPreview = Router();

docsPreview.get("/preview/:id", async (req, res, next) => {
  try {
    const id = req.params.id;

    // find doc + project
    const { rows } = await db.execute(sql`
      select id, project_id as "projectId", name, mime, storage_path as "storagePath", full_text as "fullText"
      from docs where id=${id}
    `);
    if (!rows?.length) return res.status(404).send("Not found");
    const doc = rows[0] as any;

    await assertProjectAccess(req, String(doc.projectId), "viewer");

    // direct PDF stream if present
    const isPDF = (String(doc.mime || "")).toLowerCase().includes("pdf") || String(doc.name || "").toLowerCase().endsWith(".pdf");
    if (isPDF && doc.storagePath && fs.existsSync(String(doc.storagePath))) {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${path.basename(String(doc.name))}"`);
      return fs.createReadStream(String(doc.storagePath)).pipe(res);
    }

    // Check mode for embed styling
    const mode = String(req.query.mode || "");
    const shellTop = `<!doctype html><html><head><meta charset="utf-8"><title>${doc.name}</title>
      <style>body{font-family:system-ui,Arial,sans-serif;line-height:1.5;padding:16px;max-width:960px;margin:auto;background:#0b0b0b;color:#ddd}
             h3{margin-top:0}</style></head><body>`;
    const shellBottom = `</body></html>`;

    // DOCX -> HTML using mammoth (if file exists)
    const isDOCX = (String(doc.mime || "")).toLowerCase().includes("word") || String(doc.name || "").toLowerCase().endsWith(".docx");
    if (isDOCX && doc.storagePath && fs.existsSync(String(doc.storagePath))) {
      const buf = fs.readFileSync(String(doc.storagePath));
      const { value: html } = await mammoth.convertToHtml({ buffer: buf });
      return res
        .status(200)
        .setHeader("Content-Type", "text/html; charset=utf-8")
        .send(`${shellTop}${mode==="embed"?"":`<h3>${doc.name}</h3>`}${html}${shellBottom}`);
    }

    // Fallback: render from fullText
    const text = String(doc.fullText || "(No text available for preview.)");
    const safe = text.replace(/[<>&]/g, (s: string) => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[s as '<' | '>' | '&'] as string));
    return res
      .status(200)
      .setHeader("Content-Type", "text/html; charset=utf-8")
      .send(`${shellTop}${mode==="embed"?"":`<h3>${doc.name}</h3>`}<pre>${safe}</pre>${shellBottom}`);
  } catch (e) { next(e); }
});
