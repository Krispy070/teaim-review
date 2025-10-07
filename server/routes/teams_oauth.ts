import { Router } from "express";
import fetch from "node-fetch";
import { db } from "../db/client";
import { requireProject } from "../auth/projectAccess";
import { encryptSecret, decryptSecret } from "../lib/crypto";
import { sql } from "drizzle-orm";
import { acquire } from "../lib/concurrency";
import { hostOf } from "../lib/net";

const HTTP_GLOBAL_MAX = Number(process.env.TEAIM_HTTP_GLOBAL_MAX || 12);
const HTTP_PER_HOST_MAX = Number(process.env.TEAIM_HTTP_PER_HOST_MAX || 6);

async function safePost(url:string, body:URLSearchParams){
  const relG = await acquire("http:global", HTTP_GLOBAL_MAX);
  const relH = await acquire(`http:host:${hostOf(url)}`, HTTP_PER_HOST_MAX);
  try { return await fetch(url, { method:"POST", headers:{"Content-Type":"application/x-www-form-urlencoded"}, body: body as any }); }
  finally { relH(); relG(); }
}

export const toauth = Router();

const TENANT = process.env.MS_TENANT || "common";
const CLIENT_ID = process.env.MS_CLIENT_ID || "";
const CLIENT_SECRET = process.env.MS_CLIENT_SECRET || "";
const REDIRECT = process.env.MS_REDIRECT_URL || "";

toauth.get("/start", requireProject("member"), async (req: any, res) => {
  const pid = String(req.query.projectId||"");
  const state = encodeURIComponent(JSON.stringify({ pid }));
  const scope = encodeURIComponent([
    "offline_access",
    "User.Read",
    "ChannelMessage.Read.All",
  ].join(" "));
  const url = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/authorize?client_id=${CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(REDIRECT)}&response_mode=query&scope=${scope}&state=${state}`;
  res.redirect(url);
});

toauth.get("/callback", async (req, res) => {
  try {
    const code = String(req.query.code||"");
    const stateRaw = String(req.query.state||"");
    const state = JSON.parse(decodeURIComponent(stateRaw||"{}"));
    const projectId = state.pid as string;

    const tokenResp = await safePost(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`,
      new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT,
        grant_type: "authorization_code",
        code
      })
    );
    const tok = await tokenResp.json();
    if (!tokenResp.ok) throw new Error(JSON.stringify(tok));

    const access = tok.access_token as string;
    const refresh = tok.refresh_token as string;

    const ct = encryptSecret(refresh);
    await db.execute(
      sql`insert into secrets (project_id, scope, ref_id, key_name, ciphertext, created_by)
       values (${projectId},'project',null,'MS_REFRESH_TOKEN',${ct},null)
       on conflict (project_id, scope, ref_id, key_name)
       do update set ciphertext=${ct}, rotated_at=now()`
    );

    if (access) {
      const cta = encryptSecret(access);
      await db.execute(
        sql`insert into secrets (project_id, scope, ref_id, key_name, ciphertext, created_by)
         values (${projectId},'project',null,'MS_ACCESS_TOKEN',${cta},null)
         on conflict (project_id, scope, ref_id, key_name)
         do update set ciphertext=${cta}, rotated_at=now()`
      );
    }

    res.send(`<html><body><h3>Microsoft Teams connected to TEAIM.</h3><p>You can close this window.</p></body></html>`);
  } catch (e:any) {
    res.status(500).send(String(e?.message||e));
  }
});

toauth.get("/status", requireProject("member"), async (req, res) => {
  const pid = String(req.query.projectId || "");
  const { rows } = await db.execute(
    sql`select 1 from secrets where project_id=${pid} and scope='project' and ref_id is null and key_name='MS_REFRESH_TOKEN' limit 1`
  );
  res.json({ ok: true, connected: !!rows?.length });
});

export async function getGraphAccessToken(projectId:string) {
  const acc = await db.execute(
    sql`select ciphertext from secrets where project_id=${projectId} and scope='project' and ref_id is null and key_name='MS_ACCESS_TOKEN' limit 1`
  );
  if (acc.rows?.length) {
    try { return decryptSecret((acc.rows[0] as any).ciphertext); } catch {}
  }

  const ref = await db.execute(
    sql`select ciphertext from secrets where project_id=${projectId} and scope='project' and ref_id is null and key_name='MS_REFRESH_TOKEN' limit 1`
  );
  if (!ref.rows?.length) throw new Error("MS_REFRESH_TOKEN missing");
  const refresh = decryptSecret((ref.rows[0] as any).ciphertext);

  const tokenResp = await safePost(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`,
    new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT,
      grant_type: "refresh_token",
      refresh_token: refresh
    })
  );
  const tok = await tokenResp.json();
  if (!tokenResp.ok) throw new Error(JSON.stringify(tok));

  const access = tok.access_token as string;
  const newRefresh = tok.refresh_token as string || refresh;

  const ct = encryptSecret(newRefresh);
  await db.execute(
    sql`insert into secrets (project_id, scope, ref_id, key_name, ciphertext)
     values (${projectId},'project',null,'MS_REFRESH_TOKEN',${ct})
     on conflict (project_id, scope, ref_id, key_name)
     do update set ciphertext=${ct}, rotated_at=now()`
  );
  if (access) {
    const cta = encryptSecret(access);
    await db.execute(
      sql`insert into secrets (project_id, scope, ref_id, key_name, ciphertext)
       values (${projectId},'project',null,'MS_ACCESS_TOKEN',${cta})
       on conflict (project_id, scope, ref_id, key_name)
       do update set ciphertext=${cta}, rotated_at=now()`
    );
  }
  return access;
}
