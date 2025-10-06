import { Router } from "express";
import { db } from "../db/client.js";

export const eas = Router();

// GET /api/email/app_settings
eas.get("/app_settings", async (_req,res)=>{
  const row = (await db.execute(
    `select sending_enabled as "sendingEnabled", sink, allowlist_regex as "allowlistRegex", updated_at as "updatedAt"
       from app_email_settings where id=1`, [] as any
  )).rows?.[0] || { sendingEnabled:true, sink:null, allowlistRegex:null };
  res.json({ ok:true, settings: row, env:{
    EMAIL_SINK: process.env.EMAIL_SINK||null,
    EMAIL_ALLOWLIST_REGEX: process.env.EMAIL_ALLOWLIST_REGEX||null,
    NODE_ENV: process.env.NODE_ENV||""
  }});
});

// POST /api/email/app_settings  { sendingEnabled?, sink?, allowlistRegex? }
eas.post("/app_settings", async (req,res)=>{
  const { sendingEnabled, sink, allowlistRegex } = req.body||{};
  await db.execute(
    `update app_email_settings
        set sending_enabled=coalesce($1,sending_enabled),
            sink=$2,
            allowlist_regex=$3,
            updated_at=now()
      where id=1`,
    [typeof sendingEnabled==="boolean"? sendingEnabled : null, sink||null, allowlistRegex||null] as any
  );
  res.json({ ok:true });
});

export default eas;
