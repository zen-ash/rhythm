import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  OUTBOX_ACTION,
  isConnectivityError,
  type OutboxItem,
} from "@productivity/shared";
import { supabase } from "./supabase";

// Local, AsyncStorage-backed outbox for core task actions only. Timer actions
// are intentionally excluded (handled separately by server idempotency).

const STORAGE_KEY = "outbox:v1";
// Cap transient retries so a poison item can't wedge the queue forever. Only
// transient (connectivity) failures count toward this; permanent failures are
// dropped immediately.
const MAX_RETRIES = 5;

let flushing = false;

// Outcome of attempting one item: drop it from the queue, or keep for a retry.
type ExecOutcome = "done" | "retry";

/**
 * Quiet-recovery error classification:
 *  - no error -> "done". For update/delete this includes the "0 rows affected"
 *    case (the target row is gone): Supabase returns no error, so a stale
 *    action — e.g. editing a task deleted on another device — is dropped without
 *    jamming the queue. The next server fetch reconciles the local UI.
 *  - connectivity/transport error -> "retry" (transient).
 *  - any error with a Postgres code (validation, permission/auth, FK, unique,
 *    check) -> permanent -> "done": dropped quietly rather than retried forever.
 */
function classify(error: { code?: string } | null | undefined): ExecOutcome {
  if (!error) return "done";
  if (isConnectivityError(error)) return "retry";
  return "done";
}

async function readItems(): Promise<OutboxItem[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as OutboxItem[]) : [];
  } catch {
    return [];
  }
}

async function writeItems(items: OutboxItem[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export async function enqueue(item: OutboxItem): Promise<void> {
  const items = await readItems();
  items.push(item);
  await writeItems(items);
}

export async function getOutboxCount(): Promise<number> {
  return (await readItems()).length;
}

/** Clears the entire local outbox (e.g. on account deletion / sign out). */
export async function clearOutbox(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // Best-effort.
  }
}

/** Runs one queued action; returns whether to drop it or retry it later. */
async function executeItem(
  item: OutboxItem,
  userId: string,
): Promise<ExecOutcome> {
  switch (item.type) {
    case OUTBOX_ACTION.CREATE_TASK: {
      // A retry whose row already landed comes back as a unique violation
      // (Postgres code) -> classify() treats it as permanent -> "done".
      const { error } = await supabase.from("tasks").insert({
        id: item.payload.id,
        user_id: userId,
        title: item.payload.title,
        description: item.payload.description,
        status: item.payload.status,
        scheduled_date: item.payload.scheduled_date,
      });
      return classify(error);
    }
    case OUTBOX_ACTION.TOGGLE_TASK: {
      const { error } = await supabase
        .from("tasks")
        .update({
          status: item.payload.status,
          completed_at: item.payload.completed_at,
        })
        .eq("id", item.payload.id);
      return classify(error);
    }
    case OUTBOX_ACTION.DELETE_TASK: {
      const { error } = await supabase
        .from("tasks")
        .delete()
        .eq("id", item.payload.id);
      return classify(error);
    }
    case OUTBOX_ACTION.MOVE_TASK: {
      const { error } = await supabase
        .from("tasks")
        .update({ scheduled_date: item.payload.scheduled_date })
        .eq("id", item.payload.id);
      return classify(error);
    }
    case OUTBOX_ACTION.EDIT_TASK: {
      const { error } = await supabase
        .from("tasks")
        .update({
          title: item.payload.title,
          description: item.payload.description,
          scheduled_date: item.payload.scheduled_date,
          recurrence_rule: item.payload.recurrence_rule,
        })
        .eq("id", item.payload.id);
      return classify(error);
    }
    default:
      return "done";
  }
}

/**
 * Best-effort: tries to sync every queued item, dropping resolved/permanent
 * ones and retrying transient ones (bounded by MAX_RETRIES). Never throws.
 * Returns the number of items still pending afterward.
 */
export async function flushOutbox(): Promise<number> {
  if (flushing) {
    return (await readItems()).length;
  }
  flushing = true;
  try {
    const items = await readItems();
    if (items.length === 0) return 0;

    // getSession reads the persisted session locally (no network), so flushing
    // never throws a connectivity error just trying to identify the user.
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return items.length;

    const remaining: OutboxItem[] = [];
    for (const item of items) {
      let outcome: ExecOutcome;
      try {
        outcome = await executeItem(item, user.id);
      } catch {
        // A *throw* is a transport failure -> transient -> retry later.
        outcome = "retry";
      }
      if (outcome === "retry") {
        item.retryCount += 1;
        // Keep retrying transient failures until the cap, then drop calmly so a
        // poison pill can't block everything behind it.
        if (item.retryCount < MAX_RETRIES) {
          remaining.push(item);
        }
      }
      // "done" -> permanently resolved/stale -> drop quietly.
    }
    await writeItems(remaining);
    return remaining.length;
  } catch {
    // Never throw out of flush (e.g. getSession refresh failing while offline).
    console.warn("Offline/network request failed during flushOutbox");
    return (await readItems()).length;
  } finally {
    flushing = false;
  }
}
