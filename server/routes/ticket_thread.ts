import { Router } from "express";
import { db } from "../db/client";
import { requireProject } from "../auth/projectAccess";
import { sql } from "drizzle-orm";

export const tthread = Router();

/** GET /api/tickets/:id/thread?projectId=... */
tthread.get("/:id/thread", requireProject("member"), async (req, res) => {
  const ticketId = String(req.params.id || "");
  const pid = String(req.query.projectId || "");

  // messages
  const { rows: msgs } = await db.execute(
    sql`select id, direction, from_email as "fromEmail", to_email as "toEmail",
            subject, body, message_id as "messageId", in_reply_to as "inReplyTo",
            created_at as "createdAt"
       from ticket_messages
      where ticket_id=${ticketId}
      order by created_at asc`
  ) as any;

  // attachments by message
  const { rows: att } = await db.execute(
    sql`select id, message_id as "messageId", name, content_type as "contentType", created_at as "createdAt"
       from ticket_attachments
      where project_id=${pid} and message_id in (select id from ticket_messages where ticket_id=${ticketId})
      order by created_at asc`
  ) as any;

  const byMsg: Record<string, any[]> = {};
  for (const a of att || []) {
    (byMsg[a.messageId] = byMsg[a.messageId] || []).push({
      id: a.id, name: a.name, contentType: a.contentType
    });
  }
  const thread = (msgs || []).map((m: any) => ({ ...m, attachments: byMsg[m.id] || [] }));
  res.json({ ok: true, thread });
});
