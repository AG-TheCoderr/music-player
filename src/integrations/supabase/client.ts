// Supabase client. The URL and anon key can be overridden with VITE_SUPABASE_URL /
// VITE_SUPABASE_ANON_KEY at build time; the defaults keep the deployed app working.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://oqadksqsoddegadylwtr.supabase.co';

const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xYWRrc3Fzb2RkZWdhZHlsd3RyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0MDM0MTksImV4cCI6MjA2OTk3OTQxOX0.uHU1EjyvbUUvVtnWOPlTaB7_ZRb0CPqBUQB74k4Hn0o';

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});

export { SUPABASE_URL };
