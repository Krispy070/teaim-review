import { Router } from "express";
import crypto from "node:crypto";
import { pool } from "../db/client";

export const mailgunWH = Router();

function validSig(ts:string, token:string, sig:string){
  const key = process.env.MG_WEBHOOK_SIGNING_KEY || "";
  if (!key) return true;
  const hmac = crypto.createHmac("sha256", key).update(ts+token).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(sig));
}

mailgunWH.post("/mailgun", async (req:any, res) => {
  try{
    const p = req.body || {};
    const evt = (p["event-data"] || {}).event || p.event;
    const msg = (p["event-data"] || {}).message || {};
    const rec = (p["event-data"] || {}).recipient || p.recipient;
    const ts  = (p.signature || {}).timestamp || "";
    const token = (p.signature || {}).token || "";
    const sig = (p.signature || {}).signature || "";

    if (!validSig(ts, token, sig)) return res.status(401).json({ error:"bad signature" });

    let status = "";
    if (/delivered/i.test(evt)) status = "delivered";
    else if (/complained/i.test(evt)) status = "complained";
    else if (/bounced/i.test(evt)) status = "bounced";
    else status = evt || "unknown";

    await pool.query(
      `insert into email_events (category, to_email, status, provider, provider_id, reason, trace_id)
       values ($1,$2,$3,'mailgun',$4,$5,$6)`,
      ["other", rec, status, String(msg?.headers?.["message-id"] || ""), String((p["event-data"]||{}).reason||""), String((p["event-data"]||{}).id||"")]
    );

    if (status==="bounced" || status==="complained"){
      await pool.query(
        `insert into email_suppressions (email, reason, source, active, updated_at)
         values ($1,$2,'webhook',true,now())
         on conflict (email) do update set active=true, reason=$2, source='webhook', updated_at=now()`,
        [rec, status]
      );
    }

    res.json({ ok:true });
  }catch(e:any){
    console.error("[mailgun webhook]", e);
    res.status(500).json({ error:"fail" });
  }
});

export default mailgunWH;
