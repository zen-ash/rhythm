import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";
import { requireEnv } from "./env";

// Bundlers replace literal `process.env.X` references at build time (Next.js via
// DefinePlugin, Expo via its EXPO_PUBLIC inliner). We declare `process` locally
// so this package type-checks hermetically without pulling in @types/node.
declare const process: { env: Record<string, string | undefined> };

/** A Supabase client fully typed against our generated Database schema. */
export type TypedSupabaseClient = SupabaseClient<Database>;

/**
 * Core typed-client factory. Takes an explicit url + publishable key. Use this
 * directly when a runtime cannot statically inline `process.env` references and
 * you need to pass values through yourself.
 */
export function createSupabaseClient(
  url: string,
  publishableKey: string,
): TypedSupabaseClient {
  return createClient<Database>(url, publishableKey);
}

/** Typed client for the Next.js web app. Reads the NEXT_PUBLIC_* env vars. */
export function createWebSupabaseClient(): TypedSupabaseClient {
  const url = requireEnv(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  );
  const publishableKey = requireEnv(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
  return createSupabaseClient(url, publishableKey);
}

/**
 * Persistent storage adapter for React Native session persistence. AsyncStorage
 * (and similar) satisfy this shape; the app passes one in so this package never
 * imports a React Native-only module.
 */
export interface SupabaseAuthStorage {
  getItem(key: string): Promise<string | null> | string | null;
  setItem(key: string, value: string): Promise<void> | void;
  removeItem(key: string): Promise<void> | void;
}

export interface MobileSupabaseOptions {
  /** Storage adapter used to persist the session across app restarts. */
  storage?: SupabaseAuthStorage;
}

/**
 * Typed client for the Expo iOS app.
 *
 * Takes the url + publishable key as EXPLICIT arguments rather than reading
 * `process.env` here. Expo's EXPO_PUBLIC inliner may not rewrite env references
 * inside a workspace package under node_modules, so the app reads
 * EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY in its own
 * code and passes them in.
 *
 * Pass a `storage` adapter (e.g. AsyncStorage) to persist the session across
 * restarts. `detectSessionInUrl` stays off — there is no URL session flow in a
 * native app.
 */
export function createMobileSupabaseClient(
  url: string,
  publishableKey: string,
  options: MobileSupabaseOptions = {},
): TypedSupabaseClient {
  return createClient<Database>(url, publishableKey, {
    auth: {
      storage: options.storage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
}
