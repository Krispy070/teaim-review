import fetch from "node-fetch";
import FormData from "form-data";
import { guardRecipients } from "./mailGuard";
import { pool } from "../db/client";

const MG_DOMAIN = process.env.MAILGUN_DOMAIN || "";
const MG_KEY = process.env.MAILGUN_API_KEY || "";
const MG_FROM = process.env.MAILGUN_FROM || "alerts@localhost";

type Attachment = { filename: string; contentType?: string; contentBase64: string };

let _ov:any=null, _ovAt=0;
async function getOverrides(){
  const now=Date.now();
  if (_ov && (now - _ovAt < 60_000)) return _ov;
  try{
    const r = await fetch(`http://localhost:${process.env.PORT||5000}/api/email/app_settings`);
    const j = await r.json(); if (j.ok){ _ov=j.settings||null; _ovAt=now; return _ov; }
  }catch{}
  return _ov;
}

async function isSuppressed(email:string){
  const r = await pool.query(`select active from email_suppressions where email=$1`, [email]);
  return !!(r.rows?.[0]?.active);
}

async function logEvent(to:string, status:string, category:string, reason:string="", trace:string=""){
  await pool.query(
    `insert into email_events (to_email, status, category, reason, trace_id) values ($1,$2,$3,$4,$5)`,
    [to, status, category, reason, trace]
  );
}

export async function sendEmail(to: string[], subject: string, text: string, attachments: Attachment[] = [], category="other") {
  const ov = await getOverrides();
  if (ov && ov.sendingEnabled===false){
    console.log("[email:disabled]", { subject, to }); 
    for (const a of to) await logEvent(a, "suppressed", category, "sending disabled");
    return;
  }

  const sinkOverride = ov?.sink || process.env.EMAIL_SINK || "";
  const allowRe = (ov?.allowlistRegex || process.env.EMAIL_ALLOWLIST_REGEX) ? new RegExp(ov?.allowlistRegex || process.env.EMAIL_ALLOWLIST_REGEX, "i") : null;

  const { to: finalTo, note } = guardRecipients(to);
  const trace = "";

  let recipientList = [...finalTo];
  if (allowRe){
    const kept = recipientList.filter(a=>allowRe.test(a));
    if (!kept.length && sinkOverride) recipientList = [sinkOverride]; else recipientList = kept;
  } else if (sinkOverride && (process.env.NODE_ENV!=="production")){
    recipientList = [sinkOverride];
  }

  const filtered: string[] = [];
  for (const addr of recipientList){
    if (await isSuppressed(addr)) {
      console.log("[email:suppressed]", addr);
      await logEvent(addr, "suppressed", category, "suppression active", trace);
    } else filtered.push(addr);
  }
  if (!filtered.length) return;

  const textOut = note ? `${text}\n\n${note}` : text;

  if (!MG_DOMAIN || !MG_KEY) {
    console.log("[email:dev]", { to: filtered, subject, text: textOut.slice(0,240), attachments: attachments.length });
    await Promise.allSettled(filtered.map(a=> logEvent(a, "sent", category)));
    return;
  }
  const fd = new FormData();
  fd.append("from", MG_FROM);
  fd.append("to", filtered.join(","));
  fd.append("subject", subject);
  fd.append("text", textOut);
  for (const a of attachments) {
    fd.append("attachment", Buffer.from(a.contentBase64, "base64"), {
      filename: a.filename,
      contentType: a.contentType || "application/octet-stream",
    } as any);
  }
  const resp = await fetch(`https://api.mailgun.net/v3/${MG_DOMAIN}/messages`, {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(`api:${MG_KEY}`).toString("base64") },
    body: fd as any,
  });
  if (!resp.ok) {
    const body = await resp.text();
    await Promise.allSettled(filtered.map(a=> logEvent(a, "failed", category, body)));
    console.error("[email] fail", body);
    return;
  }
  await Promise.allSettled(filtered.map(a=> logEvent(a, "sent", category)));
}

export async function sendSMS(to: string[], body: string) {
  const SID = process.env.TWILIO_SID || "";
  const TOK = process.env.TWILIO_TOKEN || "";
  const FROM = process.env.TWILIO_FROM || "";
  if (!SID || !TOK || !FROM || !to.length) return;
  for (const dest of to) {
    const fd = new URLSearchParams({ From: FROM, To: dest, Body: body });
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`, {
      method: "POST",
      headers: { Authorization: "Basic " + Buffer.from(`${SID}:${TOK}`).toString("base64"),
                 "Content-Type":"application/x-www-form-urlencoded" },
      body: fd as any,
    });
    if (!r.ok) console.error("[sms] fail", await r.text());
  }
}
