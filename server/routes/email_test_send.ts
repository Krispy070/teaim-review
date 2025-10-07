import { Router } from "express";
import { sendEmail } from "../lib/notify";
import { requireProject } from "../auth/projectAccess";

export const etest = Router();

/* POST /api/email/test_send
 * { projectId?, to: string, subject?: string, body?: string, category?: string }
 * projectId optional: events table allows null; pass when you want project scoping.
 */
etest.post("/test_send", requireProject("member"), async (req, res) => {
  const { projectId = null, to, subject = "TEAIM test email", body = "Hello from TEAIM.", category = "other" } = req.body || {};
  if (!to) return res.status(400).json({ error: "to required" });
  await sendEmail([to], subject, body, [], category);
  res.json({ ok: true });
});

export default etest;
