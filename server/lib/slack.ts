import fetch from "node-fetch";
import { acquire } from "./concurrency";
import { hostOf } from "./net";

const HTTP_GLOBAL_MAX = Number(process.env.TEAIM_HTTP_GLOBAL_MAX || 12);
const HTTP_PER_HOST_MAX = Number(process.env.TEAIM_HTTP_PER_HOST_MAX || 6);

export async function sendSlackWebhook(url:string, text:string){
  const payload = { text };
  const r = await fetch(url, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(payload) });
  if (!r.ok) console.error("[slack] fail", await r.text());
}

export async function sendGenericWebhook(url:string, payload:any){
  try {
    const r = await fetch(url, { 
      method:"POST", 
      headers:{ "Content-Type":"application/json" }, 
      body: JSON.stringify(payload) 
    });
    if (!r.ok) console.error("[webhook] fail", r.status, await r.text());
  } catch(e) {
    console.error("[webhook] error", e);
  }
}

import crypto from "node:crypto";

export function verifySlack(req: any, signingSecret: string) {
  const ts = req.headers["x-slack-request-timestamp"];
  const sig = req.headers["x-slack-signature"];
  if (!ts || !sig) return false;
  if (Math.abs(Date.now()/1000 - Number(ts)) > 60*5) return false;

  const raw = req.rawBody ? req.rawBody.toString("utf8") : JSON.stringify(req.body);
  const base = `v0:${ts}:${raw}`;
  const hmac = crypto.createHmac("sha256", signingSecret).update(base).digest("hex");
  const check = `v0=${hmac}`;
  try { return crypto.timingSafeEqual(Buffer.from(check), Buffer.from(String(sig))); } catch { return false; }
}

export async function slackWeb(apiToken: string, method: string, body: any) {
  const url = `https://slack.com/api/${method}`;
  const relG = await acquire("http:global", HTTP_GLOBAL_MAX);
  const relH = await acquire(`http:host:${hostOf(url)}`, HTTP_PER_HOST_MAX);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type":"application/json; charset=utf-8", "Authorization": `Bearer ${apiToken}` },
      body: JSON.stringify(body),
    });
    const j = await r.json() as any;
    if (!j.ok) throw new Error(`Slack ${method} failed: ${j.error || j}`);
    return j;
  } finally { relH(); relG(); }
}

export function parseSlackPermalink(url: string) {
  const m = url.match(/\/archives\/(C\w+)\/p(\d{16,})/i);
  if (!m) return null;
  const chan = m[1];
  const rawTs = m[2];
  const ts = `${rawTs.slice(0,10)}.${rawTs.slice(10)}`;
  return { channel: chan, ts };
}
