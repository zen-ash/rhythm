import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/** A focus_sessions row (already present in the generated types). */
export type FocusSession =
  Database["public"]["Tables"]["focus_sessions"]["Row"];

type RpcCaller = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

/**
 * Calls a timer RPC and returns the resulting focus_sessions row.
 *
 * The start/pause/resume/end RPCs are added by the Phase 5 migration and are
 * NOT in the generated Database types until they are regenerated. This narrow
 * cast keeps callers fully typed (FocusSession in/out) without editing the
 * generated file. Once types are regenerated, the cast can be removed.
 */
async function callTimerRpc(
  client: SupabaseClient<Database>,
  fn: string,
  args: Record<string, unknown>,
): Promise<FocusSession> {
  // Call rpc as a METHOD on the client so supabase-js keeps its `this` binding.
  // (Extracting it into a variable detaches `this` -> "reading 'rest'" crash.)
  // The RPCs aren't in the generated types yet, so cast the client narrowly.
  const { data, error } = await (
    client as unknown as { rpc: RpcCaller }
  ).rpc(fn, args);
  if (error) {
    throw new Error(error.message);
  }
  return data as FocusSession;
}

export function startTimer(
  client: SupabaseClient<Database>,
  taskId: string,
  clientActionId: string,
): Promise<FocusSession> {
  return callTimerRpc(client, "start_timer", {
    p_task_id: taskId,
    p_client_action_id: clientActionId,
  });
}

export function pauseTimer(
  client: SupabaseClient<Database>,
  focusSessionId: string,
  clientActionId: string,
): Promise<FocusSession> {
  return callTimerRpc(client, "pause_timer", {
    p_focus_session_id: focusSessionId,
    p_client_action_id: clientActionId,
  });
}

export function resumeTimer(
  client: SupabaseClient<Database>,
  focusSessionId: string,
  clientActionId: string,
): Promise<FocusSession> {
  return callTimerRpc(client, "resume_timer", {
    p_focus_session_id: focusSessionId,
    p_client_action_id: clientActionId,
  });
}

export function endTimer(
  client: SupabaseClient<Database>,
  focusSessionId: string,
  clientActionId: string,
): Promise<FocusSession> {
  return callTimerRpc(client, "end_timer", {
    p_focus_session_id: focusSessionId,
    p_client_action_id: clientActionId,
  });
}

/** Fetches the user's single active (running or paused) session, if any. */
export async function fetchActiveFocusSession(
  client: SupabaseClient<Database>,
): Promise<FocusSession | null> {
  const { data } = await client
    .from("focus_sessions")
    .select("*")
    .in("status", ["running", "paused"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}
