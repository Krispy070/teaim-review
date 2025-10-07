import { Router } from "express";
import multer from "multer";
import crypto from "node:crypto";
import FormData from "form-data";
import fetch from "node-fetch";
import { db } from "../db/client";
import { embedJobs, parseJobs, inboundEmails } from "../../shared/schema";
import { env } from "../env";
import { sql } from "drizzle-orm";

export const inbound = Router();
const upload = multer();

type Att = { filename: string; contentType?: string; contentBase64: string };

function parseAlias(addr: string) {
  const m = String(addr||"").toLowerCase().match(/^.*?ingest\+([a-z0-9\-]+)\.[a-f0-9]{8}\.([a-f0-9]{16})@/);
  if (!m) return null;
  return { code: m[1], token: m[2] };
}

// Detect tickets alias: tickets+CODE.slug.token@
function parseTicketAlias(addr: string) {
  const m = String(addr || "").toLowerCase().match(/^.*?tickets\+([a-z0-9\-]+)\.[a-f0-9]{6}\.([a-f0-9]{16})@/);
  return m ? { code: m[1], token: m[2] } : null;
}

function verifyMailgunFields(body: any) {
  const key = process.env.MAILGUN_SIGNING_KEY || "";
  const sig = body?.signature || body?.["signature"];
  const ts  = body?.timestamp || body?.["timestamp"];
  const tok = body?.token || body?.["token"];
  if (!key || !sig || !ts || !tok) return false;
  
  // Prevent replay attacks: reject if timestamp is older than 5 minutes
  const now = Math.floor(Date.now() / 1000);
  const timestamp = parseInt(ts, 10);
  if (isNaN(timestamp) || Math.abs(now - timestamp) > 300) return false;
  
  const mac = crypto.createHmac("sha256", key);
  mac.update(ts + tok);
  const digest = mac.digest("hex");
  const sigBuf = Buffer.from(sig);
  const digestBuf = Buffer.from(digest);
  if (sigBuf.length !== digestBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, digestBuf);
}

function verifyPostmark(req: any) {
  const secret = process.env.POSTMARK_SIGNING_SECRET || "";
  const header = req.get("X-Postmark-Webhook-Signature") || req.get("x-postmark-webhook-signature");
  if (!secret || !header || !req.rawBody) return false;
  const mac = crypto.createHmac("sha256", secret);
  mac.update(req.rawBody);
  const digest = mac.digest("base64");
  const headerBuf = Buffer.from(header);
  const digestBuf = Buffer.from(digest);
  if (headerBuf.length !== digestBuf.length) return false;
  return crypto.timingSafeEqual(headerBuf, digestBuf);
}

async function queueIngest(projectId: string, att: Att) {
  const buf = Buffer.from(att.contentBase64, "base64");
  const fd = new FormData();
  fd.append("file", buf, { filename: att.filename, contentType: att.contentType || "application/octet-stream" });
  fd.append("orgId", "00000000-0000-0000-0000-000000000000");
  fd.append("projectId", projectId);

  const r = await fetch(`http://127.0.0.1:${env.FASTAPI_PORT}/ingest/doc`, {
    method: "POST", body: fd as any, headers: (fd as any).getHeaders()
  });
  if (!r.ok) throw new Error(await r.text());
  const out = await r.json() as any;
  await db.insert(embedJobs).values({ docId: out.docId, projectId, status:"pending" }).onConflictDoNothing();
  await db.insert(parseJobs).values({ docId: out.docId, projectId, status:"pending" }).onConflictDoNothing();
  return out.docId as string;
}

// Mailgun will POST either application/x-www-form-urlencoded (recommended) or multipart with files.
// Support both with a single handler; JSON providers (Postmark) still work via json middleware.
inbound.post("/email", upload.any(), async (req: any, res, next) => {
  try {
    const provider = (process.env.INBOUND_PROVIDER || "none").toLowerCase();
    const body = req.body || {};

    // Signature verification
    if (provider === "mailgun") {
      if (!verifyMailgunFields(body)) return res.status(403).json({ error: "bad signature (mailgun)" });
    }
    if (provider === "postmark") {
      if (!verifyPostmark(req)) return res.status(403).json({ error: "bad signature (postmark)" });
    }

    // Normalize fields
    const to = body.recipient || body.to || (Array.isArray(body.to) ? body.to[0] : "");
    const from = body.sender || body.from || "";
    const subject = body.subject || "";
    const plain = body["body-plain"] || body.text || "";

    if (!to) return res.status(400).json({ error:"to/recipient required" });

    // --- TICKETS intake ---
    const tAlias = parseTicketAlias(to);
    if (tAlias) {
      // find project via mailbox token
      const mb = await db.execute(
        sql`select project_id as "projectId", address from ticket_mailboxes where token=${tAlias.token} limit 1`
      );
      if (!mb.rows?.length) return res.status(403).json({ error: "unknown mailbox token" });
      const projectId = (mb.rows[0] as any).projectId as string;

      // Threading by subject token [#TKT-<id>]
      const mSub = subject.match(/\[#TKT\-([0-9a-f\-]{8,})\]/i);
      let ticketId: string | null = null;
      if (mSub) {
        const t = await db.execute(
          sql`select id from tickets where id=${mSub[1]} and project_id=${projectId}`
        );
        ticketId = (t.rows?.[0] as any)?.id || null;
      }
      if (!ticketId) {
        const ins = await db.execute(
          sql`insert into tickets (project_id, source, title, description, status, priority, assignee)
           values (${projectId}, 'email', ${subject}, ${plain.slice(0, 4000)}, 'new', 'med', null) returning id`
        );
        ticketId = (ins.rows?.[0] as any)?.id;
      }

      const msgIns = await db.execute(
        sql`insert into ticket_messages (project_id, ticket_id, direction, from_email, to_email, subject, body, message_id, in_reply_to, meta)
         values (${projectId}, ${ticketId}, 'in', ${from}, ${to}, ${subject}, ${plain}, ${body?.["Message-Id"] || null}, ${body?.["In-Reply-To"] || null}, ${JSON.stringify({})}) returning id`
      );
      const msgId = (msgIns.rows?.[0] as any)?.id;

      // attachments
      const files: Express.Multer.File[] = Array.isArray(req.files) ? req.files : [];
      const postmarkAtts: Att[] = Array.isArray(body.Attachments) ? body.Attachments : [];
      const dir = "/tmp/ticket-att";
      require("fs").mkdirSync(dir, { recursive: true });
      
      const allFiles = files.length > 0 ? files : postmarkAtts;
      for (const a of allFiles) {
        const name = (a as any).filename || (a as any).originalname || (a as any).Name || "file.bin";
        const buf = (a as any).buffer 
          ? (a as any).buffer 
          : ((a as any).contentBase64 
            ? Buffer.from((a as any).contentBase64, "base64") 
            : ((a as any).Content 
              ? Buffer.from((a as any).Content, "base64") 
              : null));
        if (!buf) continue;
        
        const safe = `${msgId}_${name}`.replace(/[^\w.\-]+/g, "_");
        const full = require("path").join(dir, safe);
        require("fs").writeFileSync(full, buf);
        const sha = crypto.createHash("sha256").update(buf).digest("hex");
        
        await db.execute(
          sql`insert into ticket_attachments (project_id, message_id, name, content_type, storage_path, size_bytes, sha256)
           values (${projectId}, ${msgId}, ${name}, ${(a as any).ContentType || (a as any).contentType || (a as any).mimetype || "application/octet-stream"}, ${full}, ${buf.length}, ${sha})`
        );
      }

      return res.json({ ok: true, ticketId, messageId: msgId });
    }

    const alias = parseAlias(to);
    if (!alias) return res.status(400).json({ error:"invalid alias" });

    const { rows } = await db.execute(
      sql`select id as "projectId" from projects where ingest_alias_token=${alias.token} limit 1`
    ) as any;
    if (!rows?.length) return res.status(403).json({ error:"unknown token" });
    const projectId = rows[0].projectId as string;

    // Collect attachments (Mailgun multipart: files in req.files; Postmark: body.Attachments)
    const files: Express.Multer.File[] = Array.isArray(req.files) ? req.files : [];
    const postmarkAtts: Att[] = Array.isArray(body.Attachments) ? body.Attachments : [];
    const atts: Att[] = files.length 
      ? files.map(f => ({
          filename: f.originalname,
          contentType: f.mimetype,
          contentBase64: f.buffer.toString("base64")
        }))
      : postmarkAtts.map(a => ({
          filename: (a as any).Name || (a as any).filename || "file.bin",
          contentType: (a as any).ContentType || (a as any).contentType || "application/octet-stream",
          contentBase64: (a as any).Content || (a as any).contentBase64 || ""
        }));

    // Log inbound
    await db.insert(inboundEmails).values({
      projectId, fromAddr: from, toAddr: to, subject, meta: { provider, hasAttachments: atts.length>0 }
    });

    const docIds: string[] = [];
    if (atts.length) {
      for (const a of atts) docIds.push(await queueIngest(projectId, a));
    } else if (plain) {
      const base64 = Buffer.from(String(plain), "utf8").toString("base64");
      docIds.push(await queueIngest(projectId, { filename: `email-${Date.now()}.txt`, contentType:"text/plain", contentBase64: base64 }));
    }

    res.json({ ok:true, projectId, docIds, attachedCount: atts.length });
  } catch (e) { next(e); }
});

// Admin-only tester: upload a file and process like inbound (no signature)
import { requireProject } from "../auth/projectAccess";

inbound.post("/test", requireProject("admin"), upload.single("file"), async (req: any, res, next) => {
  try {
    if (process.env.ALLOW_INBOUND_TEST !== "1") return res.status(403).json({ error: "test disabled" });
    const projectId = String(req.body?.projectId || "");
    if (!projectId || !req.file) return res.status(400).json({ error: "projectId & file required" });

    const base64 = req.file.buffer.toString("base64");
    const id = await queueIngest(projectId, {
      filename: req.file.originalname,
      contentType: req.file.mimetype || "application/octet-stream",
      contentBase64: base64
    });
    res.json({ ok: true, projectId, docId: id });
  } catch (e) { next(e); }
});
