import { supabase } from "@/lib/supabase";

const DEV = import.meta.env.VITE_DEV_AUTH === "1";

function devOverride() {
  try { const o = JSON.parse(localStorage.getItem("kap.devAuth") || "null"); return o && o.dev ? o : null; }
  catch { return null; }
}

async function authHeaders() {
  const override = devOverride();
  if (DEV || override) {
    return {
      "X-Dev-User":  override?.user || (import.meta.env.VITE_DEV_USER || ""),
      "X-Dev-Org":   override?.org  || (import.meta.env.VITE_DEV_ORG  || ""),
      "X-Dev-Role":  override?.role || (import.meta.env.VITE_DEV_ROLE || "admin")
    } as Record<string,string>;
  }
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not authenticated");
  return { Authorization: `Bearer ${token}` };
}

export async function downloadGET(url: string, filename: string) {
  const headers = await authHeaders();
  const res = await fetch(url, { headers, credentials: "include" });
  if (!res.ok) throw new Error(await res.text());
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); URL.revokeObjectURL(a.href); a.remove();
}

export async function downloadPOST(url: string, body: any, filename: string) {
  const headers = { ...(await authHeaders()), "Content-Type": "application/json" };
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), credentials: "include" });
  if (!res.ok) throw new Error(await res.text());
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); URL.revokeObjectURL(a.href); a.remove();
}

// Legacy compatibility for existing CSV downloads
export async function downloadCsv(
  type: 'actions' | 'risks' | 'decisions', 
  projectId: string,
  options?: { onSuccess?: () => void; onError?: (error: Error) => void }
) {
  const filename = `${type}.csv`;
  const url = `/api/export/${type}.csv?project_id=${projectId}`;
  
  try {
    await downloadGET(url, filename);
    options?.onSuccess?.();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Download failed';
    options?.onError?.(new Error(errorMessage));
    throw error;
  }
}