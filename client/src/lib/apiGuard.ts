import { pushToast } from "@/lib/toast";
import { handleUnauthorized } from "@/lib/auth";

async function doFetch(input: RequestInfo, init?: RequestInit) {
  return fetch(input, init);
}

function shouldRetry(r: Response | null, err: any) {
  if (err) return true; // network failures
  if (!r) return false;
  return [429, 502, 503, 504].includes(r.status);
}

export async function guardFetch(input: RequestInfo, init?: RequestInit) {
  const method = (init?.method || "GET").toUpperCase();
  const idempotent = ["GET", "HEAD"].includes(method);
  let attempt = 0,
    lastErr: any = null,
    resp: Response | null = null;

  while (attempt < (idempotent ? 3 : 1)) {
    try {
      resp = await doFetch(input, init);
      if (!shouldRetry(resp, null)) break;
    } catch (e) {
      lastErr = e;
      if (!idempotent) break;
    }
    attempt++;
    const delay = 250 * Math.pow(2, attempt - 1); // 250ms, 500ms
    await new Promise(r => setTimeout(r, delay));
  }

  const r = resp!;
  const rid = r?.headers?.get?.("x-request-id") || "";
  const ct = r?.headers?.get?.("content-type") || "";

  if (!r) {
    const text = "Network error" + (rid ? ` • requestId: ${rid}` : "");
    pushToast({ type: "error", message: text, timeout: 5000 });
    throw lastErr || new Error(text);
  }

  if (r.ok) return /application\/json/i.test(ct) ? r.json() : r.text();

  if (r.status === 401 || r.status === 403) {
    pushToast({
      type: "error",
      message: `Unauthorized (${r.status})${rid ? ` • requestId: ${rid}` : ""}`,
      timeout: 4000,
    });
    handleUnauthorized(r.status);
    throw new Error("unauthorized");
  }

  let msg = `Request failed (${r.status})`;
  try {
    if (/application\/json/i.test(ct)) {
      const j = await r.json();
      msg = j?.error || msg;
    } else {
      const t = await r.text();
      if (t) msg = t.slice(0, 200);
    }
  } catch {}
  const text = rid ? `${msg} • requestId: ${rid}` : msg;
  pushToast({ type: "error", message: text, timeout: 6000 });
  throw new Error(text);
}
