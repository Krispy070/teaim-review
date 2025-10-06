import { supabase } from './supabase';

const DEV_AUTH = import.meta.env.VITE_DEV_AUTH === '1';
const DEV_USER = import.meta.env.VITE_DEV_USER || '12345678-1234-1234-1234-123456789abc';
const DEV_ORG = import.meta.env.VITE_DEV_ORG || '87654321-4321-4321-4321-cba987654321';
const DEV_ROLE = import.meta.env.VITE_DEV_ROLE || 'member';

// Debug development mode
if (DEV_AUTH) {
  console.log('🔧 Dev mode enabled:', { DEV_USER, DEV_ORG, DEV_ROLE });
}

// Impersonation override functionality
const DEV_OVERRIDE = () => {
  try {
    const o = JSON.parse(localStorage.getItem("kap.devAuth") || "null");
    return o && o.dev === true ? o : null;
  } catch { return null; }
};

async function baseHeaders(): Promise<Record<string, string>> {
  const override = DEV_OVERRIDE();
  if (DEV_AUTH || override) {
    const devHeaders = {
      'X-Dev-User': override?.user || DEV_USER,
      'X-Dev-Org': override?.org || DEV_ORG,
      'X-Dev-Role': override?.role || DEV_ROLE,
    };
    console.log('🔧 Development headers sent');
    return devHeaders;
  }
  
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      throw new Error('Authentication required - please log in');
    }
    return { Authorization: `Bearer ${token}` };
  } catch (error) {
    console.error('Authentication error:', error);
    throw new Error('Authentication failed - please log in');
  }
}

export async function apiGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  const headers = await baseHeaders();
  const res = await fetch(`/api${path}${qs}`, { headers });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

export async function apiPost<T>(
  path: string,
  body?: any,
  query?: Record<string, string>
): Promise<T> {
  const qs = query ? '?' + new URLSearchParams(query).toString() : '';
  const headers = { ...(await baseHeaders()), 'Content-Type': 'application/json' };
  const res = await fetch(`/api${path}${qs}`, {
    method: 'POST',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}