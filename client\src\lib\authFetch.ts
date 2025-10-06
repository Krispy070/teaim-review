import { supabase } from "@/lib/supabase";

const DEV = import.meta.env.VITE_DEV_AUTH === "1";
const devOv = () => { try { return JSON.parse(localStorage.getItem("kap.devAuth") || "null"); } catch { return null; } };

// Default fallback values for development stability
const FALLBACK_PROJECT_ID = "e1ec6ad0-a4e8-45dd-87b0-e123776ffe6e";
const FALLBACK_ORG_ID = "87654321-4321-4321-4321-cba987654321";

async function authHeaders() {
  const ov = devOv();
  if (DEV || ov?.dev) {
    return {
      "X-Dev-User": ov?.user || import.meta.env.VITE_DEV_USER || "",
      "X-Dev-Org":  ov?.org  || import.meta.env.VITE_DEV_ORG  || "",
      "X-Dev-Role": ov?.role || import.meta.env.VITE_DEV_ROLE || "admin",
    } as Record<string,string>;
  }
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not authenticated");
  return { Authorization: `Bearer ${token}` };
}

export async function authFetch(input: string, init: RequestInit = {}) {
  const h = await authHeaders();
  
  // Ensure dev headers are always attached to API requests
  let url = input;
  const isApiRequest = url.startsWith('/api/') || url.includes('/api/');
  
  // Project ID fallback guards for undefined scenarios
  if (isApiRequest && (DEV || devOv()?.dev)) {
    url = addProjectIdFallbackGuards(url);
  }
  
  // Temporary logging for debugging (remove in production)
  if (isApiRequest && (DEV || devOv()?.dev)) {
    console.log('🔧 authFetch API request:', { url, headers: h });
  }
  
  return fetch(url, { ...init, headers: { ...(init.headers || {}), ...h }, credentials: "include" });
}

function addProjectIdFallbackGuards(url: string): string {
  try {
    const urlObj = new URL(url, window.location.origin);
    
    // Check if project_id is missing, null, undefined, or "undefined"
    const projectId = urlObj.searchParams.get('project_id');
    if (!projectId || projectId === 'null' || projectId === 'undefined') {
      console.warn('🔧 authFetch: Missing or invalid project_id, applying fallback:', projectId);
      urlObj.searchParams.set('project_id', FALLBACK_PROJECT_ID);
    }
    
    // Similarly check org_id if present
    const orgId = urlObj.searchParams.get('org_id');
    if (orgId && (orgId === 'null' || orgId === 'undefined')) {
      console.warn('🔧 authFetch: Invalid org_id, applying fallback:', orgId);
      urlObj.searchParams.set('org_id', FALLBACK_ORG_ID);
    }
    
    return urlObj.pathname + urlObj.search;
  } catch (e) {
    // If URL parsing fails, return original URL
    console.warn('🔧 authFetch: URL parsing failed for fallback guards:', e);
    return url;
  }
}

export async function getJSON<T=any>(url: string) {
  const r = await authFetch(url);
  if (!r.ok) {
    const errorText = await r.text();
    // Enhanced error logging for project_id related issues
    if (errorText.includes('project') || errorText.includes('org')) {
      console.error('🔧 authFetch: API error (possibly project_id related):', { url, status: r.status, error: errorText });
    }
    throw new Error(errorText);
  }
  return r.json() as Promise<T>;
}

export async function postJSON<T=any>(url: string, body: any) {
  const r = await authFetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) {
    const errorText = await r.text();
    // Enhanced error logging for project_id related issues
    if (errorText.includes('project') || errorText.includes('org')) {
      console.error('🔧 authFetch: API error (possibly project_id related):', { url, status: r.status, error: errorText });
    }
    throw new Error(errorText);
  }
  return r.json() as Promise<T>;
}