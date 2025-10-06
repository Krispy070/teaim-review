import { createClient } from '@supabase/supabase-js';

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
