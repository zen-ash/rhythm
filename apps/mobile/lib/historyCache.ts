import AsyncStorage from "@react-native-async-storage/async-storage";

/** A completed task as shown in History, with its day's focus time attached. */
export type CompletedTaskItem = {
  id: string;
  title: string;
  completed_at: string | null;
  focusSeconds: number;
};

/**
 * Last successful History snapshot for ONE day, so opening that day offline
 * shows the last known polished result instead of a blank/stale screen. History
 * is date-specific, so the cache records its date and is only used when the
 * selected date matches.
 */
export interface HistorySnapshot {
  date: string;
  tasks: CompletedTaskItem[];
  totalFocusSeconds: number;
  cachedAt: number;
}

const KEY = "history-snapshot:v2";

export async function saveHistorySnapshot(
  snapshot: Omit<HistorySnapshot, "cachedAt">,
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({ ...snapshot, cachedAt: Date.now() } as HistorySnapshot),
    );
  } catch {
    // Best-effort cache.
  }
}

/** Returns the cached snapshot only if it is for the requested date. */
export async function loadHistorySnapshot(
  date: string,
): Promise<HistorySnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const snapshot = JSON.parse(raw) as HistorySnapshot;
    return snapshot.date === date ? snapshot : null;
  } catch {
    return null;
  }
}

/** Clears the cached History snapshot (e.g. on account deletion). */
export async function clearHistorySnapshot(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // Best-effort.
  }
}
