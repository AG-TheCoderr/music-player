/**
 * Supabase project configuration.
 *
 * The app only talks to Supabase Edge Functions over plain HTTP, so it deliberately does not
 * ship the full `@supabase/supabase-js` SDK (auth, realtime, storage, postgrest - ~260 kB).
 */

export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://oqadksqsoddegadylwtr.supabase.co';

export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xYWRrc3Fzb2RkZWdhZHlsd3RyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0MDM0MTksImV4cCI6MjA2OTk3OTQxOX0.uHU1EjyvbUUvVtnWOPlTaB7_ZRb0CPqBUQB74k4Hn0o';

/** Base URL for a given edge function. */
export const edgeFunctionUrl = (name: string): string =>
  `${SUPABASE_URL}/functions/v1/${name}`;
