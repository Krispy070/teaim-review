import { Router } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { db } from "../db/client";
import { requireProject } from "../auth/projectAccess";
import { sendEmail } from "../lib/notify";

export const trep = Router();
const upload = multer();
const DIR = "/tmp/ticket-att";
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });

// JSON (text-only) reply stays supported
trep.post("/:id", requireProject("member"), async (req,res)=>{
  const id = String(req.params.id||"");
  const { projectId, body } = req.body||{};
  if (!projectId || !body) return res.status(400).json({ error:"projectId & body required" });

  const last = (await db.execute(
    `select from_email as "from", to_email as "to", subject
       from ticket_messages where ticket_id=$1 and direction='in'
       order by created_at desc limit 1`, [id] as any
  )).rows?.[0];
  if (!last) return res.status(400).json({ error:"no inbound to reply" });

  const subject = `Re: ${last.subject || "(no subject)"} [#TKT-${id}]`;
  await sendEmail([last.from], subject, body);

  await db.execute(
    `insert into ticket_messages (project_id, ticket_id, direction, from_email, to_email, subject, body)
     values ($1,$2,'out',null,$3,$4,$5)`,
    [projectId, id, last.from, subject, body] as any
  );
  res.json({ ok:true });
});

// Multipart: /api/tickets/reply/:id/attach  (files + body)
trep.post("/:id/attach", requireProject("member"), upload.array("files", 8), async (req,res)=>{
  const id = String(req.params.id||"");
  const body = req.body?.body || "";
  const projectId = String(req.body?.projectId||"");

  const last = (await db.execute(
    `select from_email as "from", to_email as "to", subject
       from ticket_messages where ticket_id=$1 and direction='in'
       order by created_at desc limit 1`, [id] as any
  )).rows?.[0];
  if (!last) return res.status(400).json({ error:"no inbound to reply" });

  const subject = `Re: ${last.subject || "(no subject)"} [#TKT-${id}]`;

  // Send email with attachments
  const atts = (req.files as Express.Multer.File[] || []).map(f=>({
    filename: f.originalname,
    contentType: f.mimetype || "application/octet-stream",
    contentBase64: f.buffer.toString("base64"),
  }));
  await sendEmail([last.from], subject, body, atts);

  // Log outbound message
  const msgIns = await db.execute(
    `insert into ticket_messages (project_id, ticket_id, direction, from_email, to_email, subject, body)
     values ($1,$2,'out',null,$3,$4,$5) returning id`,
    [projectId, id, last.from, subject, body] as any
  );
  const msgId = msgIns.rows?.[0]?.id;

  // Persist files
  for (const f of (req.files as Express.Multer.File[] || [])) {
    const safe = `${msgId}_${f.originalname}`.replace(/[^\w.\-]+/g,"_");
    const full = path.join(DIR, safe);
    fs.writeFileSync(full, f.buffer);
    const sha = crypto.createHash("sha256").update(f.buffer).digest("hex");
    await db.execute(
      `insert into ticket_attachments (project_id, message_id, name, content_type, storage_path, size_bytes, sha256)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [projectId, msgId, f.originalname, f.mimetype || "application/octet-stream", full, f.buffer.length, sha] as any
    );
  }

  res.json({ ok:true, messageId: msgId, sent: true });
});

// New internal note with attachments (no email sent)
// POST /api/tickets/reply/:id/note  (FormData: projectId, body?, files[])
trep.post("/:id/note", requireProject("member"), upload.array("files", 16), async (req,res)=>{
  const id = String(req.params.id||"");
  const { projectId } = req.body || {};
  const body = String(req.body?.body||"");
  if (!projectId) return res.status(400).json({ error:"projectId required" });

  // Insert message with direction='note'
  const msgIns = await db.execute(
    `insert into ticket_messages (project_id, ticket_id, direction, subject, body)
     values ($1,$2,'note',$3,$4) returning id`,
    [projectId, id, body ? body.slice(0,120) : "(note)", body] as any
  );
  const msgId = msgIns.rows?.[0]?.id;

  // Persist files
  const DIR = "/tmp/ticket-att";
  require("fs").mkdirSync(DIR, { recursive:true });
  for (const f of (req.files as Express.Multer.File[] || [])) {
    const safe = `${msgId}_${f.originalname}`.replace(/[^\w.\-]+/g,"_");
    const full = require("path").join(DIR, safe);
    require("fs").writeFileSync(full, f.buffer);
    const sha = require("node:crypto").createHash("sha256").update(f.buffer).digest("hex");
    await db.execute(
      `insert into ticket_attachments (project_id, message_id, name, content_type, storage_path, size_bytes, sha256)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [projectId, msgId, f.originalname, f.mimetype || "application/octet-stream", full, f.buffer.length, sha] as any
    );
  }

  res.json({ ok:true, messageId: msgId });
});
