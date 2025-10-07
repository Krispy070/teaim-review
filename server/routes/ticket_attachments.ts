import { Router } from "express";
import { db } from "../db/client";
import { sql } from "drizzle-orm";
import fs from "node:fs";

export const tatt = Router();

/** GET /api/tickets/attachments/preview/:id */
tatt.get("/preview/:id", async (req, res) => {
  const id = String(req.params.id || "");
  const { rows } = await db.execute(
    sql`select name, content_type as "contentType", storage_path as "storagePath", url
       from ticket_attachments where id=${id}`
  ) as any;
  const a = rows?.[0];
  if (!a) return res.status(404).send("Not found");
  if (a.url) return res.redirect(a.url);
  if (a.storagePath && fs.existsSync(a.storagePath)) {
    res.setHeader("Content-Type", a.contentType || "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${a.name}"`);
    return fs.createReadStream(a.storagePath).pipe(res);
  }
  return res.status(404).send("No content");
});
