import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL || '';
const key = process.env.VITE_SUPABASE_ANON_KEY || '';

if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

const supabase = createClient(url, key);

const run = async () => {
  try {
    const sess = await supabase.auth.getSession();
    console.log('Auth session:', !!sess.data?.session ? 'present' : 'none (anon OK)');
    console.log('Supabase client initialized OK (no table access tested).');
  } catch (e) {
    console.error('Connection error:', e);
  }
};
run();
