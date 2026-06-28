/**
 * @productivity/supabase
 *
 * Safe, schema-typed Supabase client setup for the Productivity app. This
 * package is intentionally limited to typed client factories + env validation —
 * no auth flows, no UI, no business logic.
 */

// Generated schema types.
export type {
  Database,
  Tables,
  TablesInsert,
  TablesUpdate,
  Enums,
} from "./database.types";
export { Constants } from "./database.types";

// Typed client factories.
export type {
  TypedSupabaseClient,
  SupabaseAuthStorage,
  MobileSupabaseOptions,
} from "./client";
export {
  createSupabaseClient,
  createWebSupabaseClient,
  createMobileSupabaseClient,
} from "./client";

// Env validation helpers.
export { MissingEnvError, requireEnv } from "./env";

// Timer RPC wrappers (start/pause/resume/end) + active-session helper.
export type { FocusSession } from "./timer";
export {
  startTimer,
  pauseTimer,
  resumeTimer,
  endTimer,
  fetchActiveFocusSession,
} from "./timer";
