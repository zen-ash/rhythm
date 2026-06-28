import { useCallback, useSyncExternalStore } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DEFAULT_THEME_PREFERENCE,
  getTheme,
  isThemePreference,
  type ThemeColors,
  type ThemePreference,
} from "@productivity/shared";

const STORAGE_KEY = "theme-preference:v1";

// Tiny module-level store so changing the preference re-renders every consumer
// at once (all screens + the navigation/tab theme in App.tsx). Persisted to
// AsyncStorage; device-local only (never synced to the account).
let preference: ThemePreference = DEFAULT_THEME_PREFERENCE;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot(): ThemePreference {
  return preference;
}

// Hydrate the saved choice once at startup. Until this resolves we render with
// the "system" default, then re-render if a stored value differs.
void (async () => {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (isThemePreference(saved) && saved !== preference) {
      preference = saved;
      emit();
    }
  } catch {
    // Best-effort: fall back to the default preference.
  }
})();

/** Reads the chosen appearance and a setter that persists + applies it live. */
export function useThemePreference(): [
  ThemePreference,
  (next: ThemePreference) => void,
] {
  const pref = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const setPreference = useCallback((next: ThemePreference) => {
    if (next === preference) return;
    preference = next;
    emit();
    void AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {
      // Best-effort persistence; the in-memory choice still applies this session.
    });
  }, []);
  return [pref, setPreference];
}

/** Resolves the active scheme from the preference + OS appearance. */
export function useResolvedScheme(): "light" | "dark" {
  const system = useColorScheme();
  const pref = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  if (pref === "light") return "light";
  if (pref === "dark") return "dark";
  return system === "dark" ? "dark" : "light";
}

/**
 * Active theme colors. Honors the user's preference ("light"/"dark" force that
 * mode; "system" follows the OS) and re-renders when either changes.
 */
export function useTheme(): ThemeColors {
  return getTheme(useResolvedScheme());
}
