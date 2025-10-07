import { createClient } from '@supabase/supabase-js';
import { guardFetch } from "@/lib/apiGuard";

// Fallback configuration when environment variables are not set
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-anon-key';

export const supa = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: { persistSession: true, autoRefreshToken: true },
  }
);

// Legacy export for compatibility
export const supabase = supa;

// Helper function to fetch with authentication header
export async function fetchWithAuth(input: RequestInfo, init: RequestInit = {}) {
  const { data } = await supa.auth.getSession();
  const token = data.session?.access_token;
  const headers = new Headers(init.headers || {});
  
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  
  // In development mode with DEV_AUTH, add dev headers for testing
  if (import.meta.env.DEV && import.meta.env.DEV_AUTH === '1') {
    headers.set("X-Dev-User", import.meta.env.VITE_DEV_USER || "12345678-1234-1234-1234-123456789abc");
    headers.set("X-Dev-Role", import.meta.env.VITE_DEV_ROLE || "admin");
    headers.set("X-Dev-Org", import.meta.env.VITE_DEV_ORG || "test-org-id");
  }
  
  // Set Content-Type if not already set (only for requests with body)
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  
  // Use guardFetch for consistent error handling with request-id (Fix Pack v235)
  return await guardFetch(input, { ...init, headers });
}
