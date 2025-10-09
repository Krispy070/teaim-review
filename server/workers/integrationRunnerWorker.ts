import { db } from "../db/client";
import { sql } from "drizzle-orm";
import fetch from "node-fetch";
import SFTPClient from "ssh2-sftp-client";
import { lookup as mimeLookup } from "mime-types";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { readSecret } from "../lib/secretReader";
import { sendSlackWebhook, sendGenericWebhook } from "../lib/slack";
import { renderTemplate } from "../lib/templates";
import { applyDateMacros, fileNameFromTemplate } from "../lib/dateMacros";
import FormData from "form-data";
import { acquire } from "../lib/concurrency";
import { hostOf } from "../lib/net";
import { getSftp } from "../lib/sftpAbstraction";
import { handleWorkerError, workersDisabled } from "./utils";

const RUN_DIR = "/tmp/run-artifacts";
if (!fs.existsSync(RUN_DIR)) fs.mkdirSync(RUN_DIR, { recursive:true });

const SFTP_GLOBAL_MAX = Number(process.env.TEAIM_SFTP_GLOBAL_MAX || 6);
const SFTP_PER_HOST_MAX = Number(process.env.TEAIM_SFTP_PER_HOST_MAX || 3);
const HTTP_GLOBAL_MAX = Number(process.env.TEAIM_HTTP_GLOBAL_MAX || 12);
const HTTP_PER_HOST_MAX = Number(process.env.TEAIM_HTTP_PER_HOST_MAX || 6);

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, idx: number) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = new Array(Math.max(1, limit)).fill(0).map(async (_, wid) => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

async function writeArtifact(projectId:string, runId:string, name:string, contentType:string, data:Buffer|string){
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8");
  const safe = `${runId}_${name}`.replace(/[^\w.\-]+/g,"_");
  const file = path.join(RUN_DIR, safe);
  fs.writeFileSync(file, buf);
  const sha = crypto.createHash("sha256").update(buf).digest("hex");
  await db.execute(
    sql`insert into integration_run_artifacts (project_id, run_id, name, content_type, storage_path, size_bytes, sha256)
     values (${projectId}, ${runId}, ${name}, ${contentType || "application/octet-stream"}, ${file}, ${buf.length}, ${sha})`
  );
}

async function writeArtifactMeta(projectId:string, runId:string, name:string, contentType:string, storagePath:string){
  const buf = fs.readFileSync(storagePath);
  const sha = crypto.createHash("sha256").update(buf).digest("hex");
  await db.execute(
    sql`insert into integration_run_artifacts (project_id, run_id, name, content_type, storage_path, size_bytes, sha256)
     values (${projectId}, ${runId}, ${name}, ${contentType || "application/octet-stream"}, ${storagePath}, ${buf.length}, ${sha})`
  );
}

function matchPattern(name:string, pat:string){
  // very small glob: * and ?. Escapes others.
  const re = new RegExp("^" + pat.replace(/[.+^${}()|[\]\\]/g,"\\$&").replace(/\*/g,".*").replace(/\?/g,".") + "$", "i");
  return re.test(name);
}

function hexSha256(buf:Buffer){ 
  return crypto.createHash("sha256").update(buf).digest("hex"); 
}

function hexMd5(buf:Buffer){ 
  return crypto.createHash("md5").update(buf).digest("hex"); 
}

async function ensureRemoteDir(sftp: any, dir: string) {
  const exists = await sftp.exists(dir);
  if (!exists) {
    const parts = dir.split("/").filter(Boolean);
    let cur = dir.startsWith("/") ? "/" : "";
    for (const p of parts) {
      cur = cur + (cur.endsWith("/") ? "" : "/") + p;
      const e = await sftp.exists(cur);
      if (!e) await sftp.mkdir(cur);
    }
  }
}

async function projectWebhooks(projectId:string, evt:string){
  const eventsJson = JSON.stringify([evt]);
  const { rows } = await db.execute(
    sql`select type, url from webhooks where project_id=${projectId} and (events @> ${eventsJson}::jsonb)`
  );
  return rows||[];
}

async function runHttp(projectId:string, integ:any, runId:string) {
  const cfg = integ.adapterConfig || {};
  const url  = cfg.httpUrl || integ.runbookUrl || "";
  if (!url) throw new Error("httpUrl missing");

  const method = (integ.adapterType==="http_post" ? "POST" : "GET") as "GET"|"POST";
  const headers: Record<string,string> = cfg.headers || {};
  if (cfg.headerSecret) {
    const sec = await readSecret(projectId, "integration", integ.id, cfg.headerSecret);
    if (sec) headers["Authorization"] = sec;
  }
  const body = method==="POST" ? (cfg.bodyTemplate ? JSON.stringify(cfg.bodyTemplate) : undefined) : undefined;

  // destination file
  const filename = (url.split("/").slice(-1)[0] || "download.bin").split("?")[0];
  const dest = path.join(RUN_DIR, `${runId}_${filename}`.replace(/[^\w.\-]+/g,"_"));
  let start = 0;
  if (cfg.download?.resume && fs.existsSync(dest)) start = fs.statSync(dest).size;
  if (start>0) headers["Range"] = `bytes=${start}-`;

  const relG = await acquire("http:global", HTTP_GLOBAL_MAX);
  const relH = await acquire(`http:host:${hostOf(url)}`, HTTP_PER_HOST_MAX);
  let r;
  try {
    r = await fetch(url, { method, headers, body });
  } catch (e) {
    relH(); relG();
    throw e;
  }
  try {
    if (r.status===416) {
      await writeArtifactMeta(projectId, runId, filename, String(mimeLookup(filename) || "application/octet-stream"), dest);
      await db.execute(sql`update integration_runs set note=${`HTTP OK (cached) — ${filename}`} where id=${runId}`);
      return;
    }
    if (!r.ok && r.status!==206) {
      const text = await r.text().catch(()=>`HTTP ${r.status}`);
      await db.execute(sql`update integration_runs set note=${String(text).slice(0,4000)} where id=${runId}`);
      throw new Error(`HTTP ${r.status}`);
    }

    const w = fs.createWriteStream(dest, { flags: start>0 ? "a" : "w" });
    await new Promise<void>((resolve,reject)=>{
      (r.body as any).pipe(w);
      (r.body as any).on("error", reject);
      w.on("finish", resolve);
      w.on("error", reject);
    });

    await writeArtifactMeta(projectId, runId, filename, r.headers.get("content-type") || String(mimeLookup(filename) || "application/octet-stream"), dest);
    await db.execute(sql`update integration_runs set note=${`HTTP OK — saved ${filename}`} where id=${runId}`);
  } finally { relH(); relG(); }
}

async function runSftp(projectId:string, integ:any, runId:string) {
  const cfg = integ.adapterConfig || {};
  const host = cfg.host || (await readSecret(projectId, "integration", integ.id, "SFTP_HOST"));
  const user = cfg.user || (await readSecret(projectId, "integration", integ.id, "SFTP_USER"));
  const pass = await readSecret(projectId, "integration", integ.id, "SFTP_PASSWORD");
  const basePath = cfg.path || "/";
  const pattern  = cfg.download?.pattern || cfg.pattern || "*";
  const maxFiles = Number(cfg.download?.maxFiles || 3);
  if (!host || !user || !pass) throw new Error("SFTP credentials missing");

  const moveCfg = cfg.download?.moveAfter || null;
  const verify  = cfg.download?.verify || null as null | {
    algorithm?: "sha256"|"md5",
    sidecarSuffix?: string
  };
  const delCfg  = cfg.download?.deleteAfter || null as null | {
    original?: boolean, 
    checksum?: boolean
  };

  const relGlobal = await acquire("sftp:global", SFTP_GLOBAL_MAX);
  const relHost   = await acquire(`sftp:host:${host}`, SFTP_PER_HOST_MAX);
  try {
    const sftp = await getSftp(host, user, pass, cfg.port);
  const list = await sftp.list(basePath);

  const re = new RegExp("^"+ String(pattern)
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".") + "$", "i");

  const matches = list
    .filter((f:any)=> f.type==='-' && re.test(f.name))
    .sort((a:any,b:any)=> (b.modifyTime||b.modify||0) - (a.modifyTime||a.modify||0))
    .slice(0, maxFiles);

  let saved=0, moved=0, deleted=0, notes:string[]=[];
  for (const f of matches) {
    const remote = (basePath.endsWith("/") ? basePath : basePath + "/") + f.name;
    // Pull file
    const destLocal = path.join(RUN_DIR, `${runId}_${f.name}`.replace(/[^\w.\-]+/g,"_"));
    const ws = fs.createWriteStream(destLocal);
    await new Promise<void>((resolve,reject)=>{
      sftp.get(remote, ws).then(()=>resolve()).catch(reject);
      ws.on("error", reject);
    });

    const buf = fs.readFileSync(destLocal);
    const shaLocal = hexSha256(buf);
    const md5Local = hexMd5(buf);
    await writeArtifactMeta(projectId, runId, f.name, String(mimeLookup(f.name) || "application/octet-stream"), destLocal);
    saved++;

    // Checksum verification (sidecar)
    if (verify && verify.sidecarSuffix) {
      const algo = (verify.algorithm || "sha256").toLowerCase();
      const sidecar = remote + verify.sidecarSuffix; // e.g., file.csv.sha256
      let remoteHashText: string | null = null;
      try {
        const tmpSide = path.join(RUN_DIR, `${runId}_${f.name}${verify.sidecarSuffix}`.replace(/[^\w.\-]+/g,"_"));
        const ws2 = fs.createWriteStream(tmpSide);
        await new Promise<void>((resolve,reject)=>{ sftp.get(sidecar, ws2).then(()=>resolve()).catch(reject); ws2.on("error",reject); });
        remoteHashText = fs.readFileSync(tmpSide, "utf8").trim();
        // common formats: "<hash>  filename" or just "<hash>"
        const h = remoteHashText.split(/\s+/)[0];
        const ok = (algo === "sha256") ? (h.toLowerCase() === shaLocal.toLowerCase())
                                       : (h.toLowerCase() === md5Local.toLowerCase());
        notes.push(ok ? `checksum OK (${algo}) for ${f.name}` : `checksum FAIL (${algo}) for ${f.name}`);
        if (!ok) throw new Error(`Checksum mismatch for ${f.name}`);
        // delete sidecar if configured
        if (delCfg?.checksum) { await sftp.delete(sidecar).catch(()=>{}); deleted++; }
      } catch (e:any) {
        // sidecar missing or mismatch → record but continue (or throw to fail run)
        if (!remoteHashText) notes.push(`checksum sidecar not found for ${f.name}`);
        else throw e; // mismatch → fail run
      }
    }

    // Optional delete original
    if (delCfg?.original) {
      try { await sftp.delete(remote); deleted++; notes.push(`deleted ${f.name}`); }
      catch (e:any) { notes.push(`delete failed for ${f.name}: ${String(e?.message||e)}`); }
    }

    // Move/rename (if set and keepOriginal not requested by deleteAfter)
    if (moveCfg && !delCfg?.original) {
      const d = new Date();
      const outName = (moveCfg.prefix || "") + f.name + (moveCfg.suffix || "");
      const datedDir = moveCfg.dateDir ? `/${d.getUTCFullYear()}/${String(d.getUTCMonth()+1).padStart(2,"0")}/${String(d.getUTCDate()).padStart(2,"0")}` : "";
      const moveDir = applyDateMacros((moveCfg.toDir || basePath) + datedDir);
      await ensureRemoteDir(sftp, moveDir);
      const remoteTarget = (moveDir.endsWith("/") ? moveDir : moveDir + "/") + outName;
      try { await sftp.rename(remote, remoteTarget); moved++; notes.push(`moved ${f.name} → ${remoteTarget}`); }
      catch (e:any) { notes.push(`move failed for ${f.name}: ${String(e?.message||e)}`); }
    }
  }

    await sftp.end();
    const msg = `SFTP OK — saved ${saved}/${matches.length} file(s)` +
                (moved ? `; ${moved} moved` : "") +
                (deleted ? `; ${deleted} deleted` : "");
    await db.execute(sql`update integration_runs set note=${msg + (notes.length?`\n${notes.join("\n")}`:"")} where id=${runId}`);
  } finally {
    relHost(); relGlobal();
  }
}

function writeTemp(runId:string, name:string, buf:Buffer){
  const dest = path.join(RUN_DIR, `${runId}_${name}`.replace(/[^\w.\-]+/g,"_"));
  fs.writeFileSync(dest, buf);
  return dest;
}

async function runHttpPost(projectId:string, integ:any, runId:string){
  const cfg = integ.adapterConfig || {};
  const url = cfg.httpUrl || "";
  if (!url) throw new Error("httpUrl missing");
  const headers = await renderTemplate(projectId, integ.id, runId, cfg.headers || { "Content-Type":"application/json" });
  let body:any = await renderTemplate(projectId, integ.id, runId, cfg.bodyTemplate || {});
  const isJson = String(headers["Content-Type"]||"").toLowerCase().includes("application/json");
  const payload = (typeof body === "string") ? body : (isJson ? JSON.stringify(body) : String(body));
  
  const relG = await acquire("http:global", HTTP_GLOBAL_MAX);
  const relH = await acquire(`http:host:${hostOf(url)}`, HTTP_PER_HOST_MAX);
  try {
    const resp = await fetch(url, { method:"POST", headers, body: payload });

    const text = await resp.text();
    await db.execute(sql`update integration_runs set note=${`HTTP POST ${resp.status}\n${text.slice(0,1000)}`} where id=${runId}`);
    await writeArtifactMeta(projectId, runId, "http_request.json", "application/json", writeTemp(runId, "http_request.json", Buffer.from(JSON.stringify({ url, headers, body: payload }, null, 2))));
    await writeArtifactMeta(projectId, runId, "http_response.txt", "text/plain", writeTemp(runId, "http_response.txt", Buffer.from(text)));

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  } finally { relH(); relG(); }
}

async function runSftpPush(projectId:string, integ:any, runId:string){
  const cfg = integ.adapterConfig || {};
  const host = cfg.host || (await readSecret(projectId, "integration", integ.id, "SFTP_HOST"));
  const user = cfg.user || (await readSecret(projectId, "integration", integ.id, "SFTP_USER"));
  const pass = await readSecret(projectId, "integration", integ.id, "SFTP_PASSWORD");
  if (!host || !user || !pass) throw new Error("SFTP credentials missing");

  const pushCfg = cfg.push || {};
  const remoteDir  = pushCfg.remotePath || cfg.path || "/";
  const source     = String(pushCfg.source || "content").toLowerCase();   // "content" | "latest_artifact" | "latest_artifacts"
  const maxFiles   = Number(pushCfg.maxFiles || 10);                      // for batch
  const pattern    = String(pushCfg.artifactPattern || ".*");
  const sinceHrs   = Number(pushCfg.sinceHours || 168);
  const parallel   = Math.max(1, Number(pushCfg.parallel || 3));          // NEW

  const now = new Date();

  // Build the upload list
  let toPush: Array<{ local: string; name: string }> = [];

  if (source === "latest_artifacts") {
    const rows = (await db.execute(
      `select a.storage_path as "p", a.name
         from integration_run_artifacts a
      join integration_runs r on r.id = a.run_id
        where r.integration_id=$1
          and a.storage_path is not null
          and a.name ~ $2
          and a.created_at >= now() - ($3 || ' hours')::interval
        order by a.created_at desc
        limit $4`,
      [integ.id, pattern, String(sinceHrs), maxFiles] as any
    )).rows || [];
    if (!rows.length) throw new Error("No artifacts found to push");
    toPush = rows.map((art:any) => {
      const finalName = pushCfg.filename
        ? fileNameFromTemplate(pushCfg.filename, art.name, now)
        : art.name;
      return { local: art.p, name: finalName };
    });
  } else if (source === "latest_artifact") {
    const rows = (await db.execute(
      `select a.storage_path as "p", a.name
         from integration_run_artifacts a
      join integration_runs r on r.id = a.run_id
        where r.integration_id=$1
          and a.storage_path is not null
          and a.name ~ $2
          and a.created_at >= now() - ($3 || ' hours')::interval
        order by a.created_at desc
        limit 1`,
      [integ.id, pattern, String(sinceHrs)] as any
    )).rows || [];
    if (!rows.length) throw new Error("No artifact found for push");
    const finalName = pushCfg.filename
      ? fileNameFromTemplate(pushCfg.filename, rows[0].name, now)
      : rows[0].name;
    toPush = [{ local: rows[0].p, name: finalName }];
  } else {
    // contentTemplate mode (single file)
    const content   = pushCfg.contentTemplate ? await renderTemplate(projectId, integ.id, runId, pushCfg.contentTemplate) : "TEAIM";
    const data      = Buffer.from(typeof content === "string" ? content : JSON.stringify(content, null, 2));
    const filename  = pushCfg.filename ? applyDateMacros(pushCfg.filename, now) : `payload_${now.getTime()}.txt`;
    const local     = writeTemp(runId, filename, data);
    toPush = [{ local, name: filename }];
  }

  const outDir = applyDateMacros(remoteDir, now);

  // Upload with concurrency (independent short-lived connections)
  const results = await runWithConcurrency(toPush, parallel, async (item) => {
    const relGlobal = await acquire("sftp:global", SFTP_GLOBAL_MAX);
    const relHost   = await acquire(`sftp:host:${host}`, SFTP_PER_HOST_MAX);
    try {
      const sftp = await getSftp(host, user, pass, cfg.port);
      await ensureRemoteDir(sftp, outDir);
      const remote = (outDir.endsWith("/") ? outDir : outDir + "/") + item.name;
      await sftp.put(item.local, remote);
      await sftp.end();

      // record a small meta artifact
      await writeArtifactMeta(projectId, runId, `push_${item.name}.meta.json`, "application/json",
        writeTemp(runId, `push_${item.name}.meta.json`, Buffer.from(JSON.stringify({ remote, local: item.local }, null, 2)))
      );
      return `pushed ${item.name} → ${remote}`;
    } finally {
      relHost(); relGlobal();
    }
  });

  await db.execute(`update integration_runs set note=$1 where id=$2`, [
    `SFTP PUSH OK — ${toPush.length} file(s) (parallel=${parallel})\n` + results.join("\n"), runId
  ] as any);
}

async function runHttpPostMultipart(projectId: string, integ: any, runId: string) {
  const cfg = integ.adapterConfig || {};
  const url = cfg.httpUrl || cfg.multipart?.url || "";
  if (!url) throw new Error("httpUrl (or multipart.url) missing");

  // 1) pick latest artifact
  const pattern = String(cfg.multipart?.artifactPattern || ".*");
  const sinceH  = Number(cfg.multipart?.sinceHours || 168);
  const rows = (await db.execute(
    sql`select a.storage_path as "p", a.name, a.content_type as "ct", a.created_at as "at"
       from integration_run_artifacts a
      join integration_runs r on r.id = a.run_id
      where r.integration_id=${integ.id}
        and a.storage_path is not null
        and a.name ~ ${pattern}
        and a.created_at >= now() - (${String(sinceH)} || ' hours')::interval
      order by a.created_at desc
      limit 1`
  )).rows || [];
  if (!rows.length) throw new Error("No artifact found for multipart POST");
  const art = rows[0];

  // 2) headers + fields (templated)
  const hdrs = await renderTemplate(projectId, integ.id, runId, cfg.multipart?.headers || {});
  const fields = await renderTemplate(projectId, integ.id, runId, cfg.multipart?.fields || {});

  // 3) build multipart
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, typeof v === "string" ? v : JSON.stringify(v));
  const fileField = cfg.multipart?.fileField || "file";
  let fileName  = cfg.multipart?.fileName  || art.name;
  fileName = applyDateMacros(fileName);
  fd.append(fileField, fs.createReadStream(art.p), { filename: fileName, contentType: art.ct || "application/octet-stream" } as any);

  // 4) send
  const headers = { ...hdrs, ...fd.getHeaders() };
  const relG = await acquire("http:global", HTTP_GLOBAL_MAX);
  const relH = await acquire(`http:host:${hostOf(url)}`, HTTP_PER_HOST_MAX);
  try {
    const resp = await fetch(url, { method: "POST", headers, body: fd as any });
    const text = await resp.text().catch(()=>"");
    await db.execute(sql`update integration_runs set note=${`HTTP POST (multipart) ${resp.status}\n${text.slice(0,1000)}`} where id=${runId}`);

    // 5) persist request/response as artifacts for traceability
    const reqMetaPath = writeTemp(runId, "http_multipart_request.json", Buffer.from(JSON.stringify({ url, headers: hdrs, fields, file: { field: fileField, name: fileName } }, null, 2)));
    await writeArtifactMeta(projectId, runId, "http_multipart_request.json", "application/json", reqMetaPath);
    const respPath = writeTemp(runId, "http_multipart_response.txt", Buffer.from(text));
    await writeArtifactMeta(projectId, runId, "http_multipart_response.txt", "text/plain", respPath);

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  } finally { relH(); relG(); }
}

async function runHttpPut(projectId:string, integ:any, runId:string){
  const cfg = integ.adapterConfig || {};
  const url = cfg.httpUrl || cfg.put?.url || "";
  if (!url) throw new Error("httpUrl (or put.url) missing");

  // Headers templated (can inject secrets)
  const headers = await renderTemplate(projectId, integ.id, runId, cfg.put?.headers || cfg.headers || {});

  // Mode: "body" (templated JSON/text) or "artifact"
  const mode = (cfg.put?.source || "body").toLowerCase();

  let body: any;
  let contentType = String(headers["Content-Type"] || headers["content-type"] || "");
  if (mode === "artifact") {
    // pick latest artifact by pattern since hours
    const pattern = String(cfg.put?.artifactPattern || ".*");
    const sinceH  = Number(cfg.put?.sinceHours || 168);
    const rows = (await db.execute(
      sql`select a.storage_path as "p", a.name, coalesce(a.content_type,'') as "ct"
         from integration_run_artifacts a
      join integration_runs r on r.id = a.run_id
        where r.integration_id=${integ.id}
          and a.storage_path is not null
          and a.name ~ ${pattern}
          and a.created_at >= now() - (${String(sinceH)} || ' hours')::interval
        order by a.created_at desc
        limit 1`
    )).rows || [];
    if (!rows.length) throw new Error("No artifact found for HTTP PUT");
    const art = rows[0];
    body = fs.createReadStream(art.p);
    if (!contentType) contentType = art.ct || String(mimeLookup(art.name) || "application/octet-stream");
    headers["Content-Type"] = contentType;
  } else {
    // bodyTemplate (object or string) → stringify if JSON
    const tpl = await renderTemplate(projectId, integ.id, runId, cfg.put?.bodyTemplate || cfg.bodyTemplate || {});
    if (!contentType) { headers["Content-Type"] = "application/json"; contentType = "application/json"; }
    body = contentType.includes("application/json") ? JSON.stringify(tpl) : String(tpl);
  }

  // fire
  const relG = await acquire("http:global", HTTP_GLOBAL_MAX);
  const relH = await acquire(`http:host:${hostOf(url)}`, HTTP_PER_HOST_MAX);
  try {
    const r = await fetch(url, { method:"PUT", headers, body: body as any });
    const text = await r.text().catch(()=> "");
    await db.execute(sql`update integration_runs set note=${`HTTP PUT ${r.status}\n${text.slice(0,1000)}`} where id=${runId}`);

    // persist request/response meta
    const reqMeta = writeTemp(runId, "http_put_request.json", Buffer.from(JSON.stringify({ url, headers, mode }, null, 2)));
    await writeArtifactMeta(projectId, runId, "http_put_request.json", "application/json", reqMeta);
    const respMeta = writeTemp(runId, "http_put_response.txt", Buffer.from(text));
    await writeArtifactMeta(projectId, runId, "http_put_response.txt", "text/plain", respMeta);

    if (!r.ok) throw new Error(`HTTP ${r.status}`);
  } finally { relH(); relG(); }
}

export function startIntegrationRunnerWorker(){
  setInterval(async ()=>{
    if (workersDisabled()) return;
    try{
      const { rows } = await db.execute(
        sql`select r.id as "runId", r.project_id as "projectId", r.integration_id as "integrationId",
                r.attempts, i.adapter_type as "adapterType", i.adapter_config as "adapterConfig", i.name, i.runbook_url as "runbookUrl"
           from integration_runs r
      inner join integrations i on i.id = r.integration_id
          where r.status='planned' and coalesce(r.planned_at, now()) <= now() + interval '30 seconds'
          order by r.planned_at asc
          limit 10`
      );
      for (const r of (rows||[])) {
        try {
          const maxRetries = Number(r.adapterConfig?.retries ?? 2);
          await db.execute(
            sql`update integration_runs set status='running', started_at=now(), attempts=attempts+1 where id=${r.runId}`
          );

          const type = (r.adapterType||"").toLowerCase();
          if (type==="http_post") {
            await runHttpPost(r.projectId, r, r.runId);
          } else if (type==="http_post_multipart") {
            await runHttpPostMultipart(r.projectId, r, r.runId);
          } else if (type==="http_put") {
            await runHttpPut(r.projectId, r, r.runId);
          } else if (type==="sftp_push") {
            await runSftpPush(r.projectId, r, r.runId);
          } else if (type==="http_get") {
            await runHttp(r.projectId, r, r.runId);
          } else if (type==="sftp_pull") {
            await runSftp(r.projectId, r, r.runId);
          } else {
            await db.execute(
              sql`update integration_runs set note=${"No adapter configured; noop"} where id=${r.runId}`
            );
          }

          await db.execute(
            sql`update integration_runs set status='success', finished_at=now(), duration_ms = extract(epoch from (now() - started_at))*1000 where id=${r.runId}`
          );
          
          for (const w of await projectWebhooks(r.projectId, "run_success")) {
            if (w.type==="slack") {
              await sendSlackWebhook(w.url, `:white_check_mark: Run success — ${r.name} (${r.integrationId})`);
            } else if (w.type==="generic") {
              await sendGenericWebhook(w.url, { 
                event: "run_success", 
                integration: { id: r.integrationId, name: r.name }, 
                projectId: r.projectId, 
                runId: r.runId,
                timestamp: new Date().toISOString()
              });
            }
          }
        } catch (e:any) {
          if (handleWorkerError("integrationRunner", e)) {
            return;
          }
          const attemptsRow = await db.execute(sql`select attempts from integration_runs where id=${r.runId}`);
          const attempts = attemptsRow.rows?.[0]?.attempts || 1;
          const maxRetries = Number(r.adapterConfig?.retries ?? 2);
          const note = String(e?.message||e).slice(0,4000);

          if (attempts <= maxRetries) {
            const mins = Math.min(30, Math.pow(2, attempts));
            await db.execute(
              sql`update integration_runs set status='planned', finished_at=null, note=${`Retry ${attempts}/${maxRetries}: ${note}`}, planned_at = now() + (${String(mins)} || ' minutes')::interval where id=${r.runId}`
            );
          } else {
            await db.execute(
              sql`update integration_runs set status='failed', finished_at=now(), note=${note} where id=${r.runId}`
            );
            
            const payload = JSON.stringify({ integrationId: r.integrationId, name: r.name });
            await db.execute(
              sql`insert into notifications (project_id, type, payload, is_read) values (${r.projectId}, 'integration_failed', ${payload}, false)`
            );
            
            for (const w of await projectWebhooks(r.projectId, "run_failed")) {
              if (w.type==="slack") {
                await sendSlackWebhook(w.url, `:x: Run failed — ${r.name} (${r.integrationId})`);
              } else if (w.type==="generic") {
                await sendGenericWebhook(w.url, { 
                  event: "run_failed", 
                  integration: { id: r.integrationId, name: r.name }, 
                  projectId: r.projectId, 
                  runId: r.runId,
                  error: String(e?.message||e).slice(0,1000),
                  timestamp: new Date().toISOString()
                });
              }
            }
          }
        }
      }
    }catch(e){
      handleWorkerError("integrationRunner", e);
    }
  }, 30_000);
}
