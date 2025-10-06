import { fetchWithAuth } from "@/lib/supabase";
import { getProjectId } from "@/lib/project";
import { pushToast } from "@/lib/toast";

/* --- settings --- */
const TIMEOUT_MS = 25_000;
const RETRY_STATUSES = new Set([429, 502, 503, 504]);
const MAX_RETRIES = 3;

/* circuit breaker per-host */
const CIRCUIT: Record<string,{ openUntil:number }> = {};

/* --- public --- */
type Guard<T> = (j:any)=>j is T;

export async function apiGet<T=any>(path:string, guard?:Guard<T>): Promise<T>{
  return call<T>("GET", path, undefined, guard);
}
export async function apiPost<T=any>(path:string, body:any, guard?:Guard<T>, opts?:{ retry?:boolean }): Promise<T>{
  return call<T>("POST", path, body, guard, opts);
}
export async function apiPatch<T=any>(path:string, body:any, guard?:Guard<T>, opts?:{ retry?:boolean }): Promise<T>{
  return call<T>("PATCH", path, body, guard, opts);
}
export async function apiDelete<T=any>(path:string, guard?:Guard<T>): Promise<T>{
  return call<T>("DELETE", path, undefined, guard);
}

/* --- core --- */
async function call<T>(method:"GET"|"POST"|"PATCH"|"DELETE", path:string, body?:any, guard?:Guard<T>, opts?:{ retry?:boolean }): Promise<T>{
  const url = appendPid(path);
  const host = hostOf(url);

  // circuit open?
  if (CIRCUIT[host]?.openUntil && Date.now() < CIRCUIT[host].openUntil) {
    const ms = Math.ceil((CIRCUIT[host].openUntil - Date.now())/1000);
    raise({ error:`Temporarily paused requests to ${host} (${ms}s)` }, "");
  }

  let attempt = 0;
  let lastErr:any = null;

  while (attempt <= MAX_RETRIES) {
    const ac = new AbortController();
    const t = setTimeout(()=>ac.abort(), TIMEOUT_MS);

    try{
      const res = await fetchWithAuth(url, {
        method,
        body: body===undefined ? undefined : JSON.stringify(body),
        signal: ac.signal
      });
      clearTimeout(t);

      const trace = res.headers.get("x-trace-id") || "";
      
      // handle empty responses: 204 or content-length: 0
      const contentLen = res.headers.get("content-length");
      if (res.status === 204 || contentLen === "0") {
        return {} as T;
      }

      // try to parse JSON; if it fails on success response, return empty object
      const j = await res.json().catch((e)=> res.ok ? {} : { error:"bad json" });

      if (!res.ok) {
        // retry candidates
        if (RETRY_STATUSES.has(res.status) && (method==="GET" || opts?.retry)) {
          const backoff = Math.min(1000 * 2 ** attempt + jitter(), 10_000);
          await sleep(backoff); attempt++; lastErr = j;
          // trip circuit for repeated 429/503
          if (attempt===MAX_RETRIES && (res.status===429 || res.status===503)) CIRCUIT[host] = { openUntil: Date.now()+30_000 };
          continue;
        }
        return raise(j, trace);
      }

      if (guard && !guard(j)) return raise({ error:"invalid shape" }, trace);
      return j;

    } catch (e:any) {
      clearTimeout(t);
      // network/abort: retry GET / opted POST
      const isAbort = e?.name === "AbortError";
      if ((isAbort || e?.message?.includes("Failed to fetch")) && (method==="GET" || opts?.retry) && attempt<MAX_RETRIES){
        await sleep(Math.min(1000 * 2 ** attempt + jitter(), 10_000)); attempt++; lastErr = e; continue;
      }
      // trip circuit on repeated net errors
      CIRCUIT[host] = { openUntil: Date.now()+20_000 };
      return raise({ error: e?.message || "network error"}, "");
    }
  }

  return raise(lastErr || { error:"request failed" }, "");
}

/* utils */
function appendPid(url:string){
  const pid = getProjectId(); if (!pid) return url;
  if (url.includes("projectId=")) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}projectId=${encodeURIComponent(pid)}`;
}

function raise(j:any, trace:string): never{
  const msg = j?.error || j?.message || "Request failed";
  if (msg) pushToast({ type:"error", message: `${msg}${trace?` • trace ${trace}`:""}` });
  throw new Error(msg);
}
function hostOf(u:string){ try { return new URL(u, window.location.origin).host.toLowerCase(); } catch { return "unknown"; } }
function sleep(ms:number){ return new Promise(r=>setTimeout(r, ms)); }
function jitter(){ return Math.floor(Math.random()*250); }

/* guards (optional) */
export const gOkCounts = (k:string[]) => (j:any): j is any => j && j.ok && j.counts && k.every(x=> x in j.counts);
export const gOk = (j:any): j is any => j && j.ok;
