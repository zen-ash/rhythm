import { createBrowserClient } from "@supabase/ssr";
import { requireEnv, type Database } from "@productivity/supabase";

/**
 * Typed browser Supabase client. Used only for client-side concerns that the
 * server client can't do — currently just the Realtime subscription. It reads
 * the session from cookies, so Realtime is authenticated and RLS-scoped.
 */
export function createBrowserSupabaseClient() {
  return createBrowserClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    requireEnv(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
  );
}
