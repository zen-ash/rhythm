import AsyncStorage from "@react-native-async-storage/async-storage";
import type { FocusSession, Tables } from "@productivity/supabase";

type Task = Tables<"tasks">;

export interface DailySummary {
  focusSeconds: number;
  sessionCount: number;
  taskCount: number;
}

/**
 * Last successful Today snapshot, persisted so the user still sees their tasks
 * when the app is opened offline (or a refetch fails). This is a simple cache,
 * NOT offline-first state — it is always overwritten by a fresh online load.
 */
export interface TodaySnapshot {
  tasks: Task[];
  activeSession: FocusSession | null;
  summary: DailySummary;
  ts: number;
}

const KEY = "today-snapshot:v1";

export async function saveTodaySnapshot(snapshot: TodaySnapshot): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(snapshot));
  } catch {
    // Best-effort cache; ignore write failures.
  }
}

export async function loadTodaySnapshot(): Promise<TodaySnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as TodaySnapshot) : null;
  } catch {
    return null;
  }
}

/** Clears the cached Today snapshot (e.g. on account deletion / sign out). */
export async function clearTodaySnapshot(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // Best-effort.
  }
}
