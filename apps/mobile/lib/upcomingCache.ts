import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Tables } from "@productivity/supabase";

type Task = Tables<"tasks">;

/**
 * Last successful Upcoming snapshot, so opening the app offline shows the last
 * known future tasks instead of a blank screen. A simple cache, not offline
 * state — always overwritten by a fresh online load.
 */
export interface UpcomingSnapshot {
  tasks: Task[];
  cachedAt: number;
}

const KEY = "upcoming-snapshot:v1";

export async function saveUpcomingSnapshot(tasks: Task[]): Promise<void> {
  try {
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({ tasks, cachedAt: Date.now() } satisfies UpcomingSnapshot),
    );
  } catch {
    // Best-effort cache; ignore write failures.
  }
}

export async function loadUpcomingSnapshot(): Promise<UpcomingSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as UpcomingSnapshot) : null;
  } catch {
    return null;
  }
}

/** Clears the cached Upcoming snapshot (e.g. on account deletion). */
export async function clearUpcomingSnapshot(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // Best-effort.
  }
}
