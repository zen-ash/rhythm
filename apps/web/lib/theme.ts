import {
  DEFAULT_THEME_PREFERENCE,
  isThemePreference,
  type ThemePreference,
} from "@productivity/shared";

// Device-local appearance preference (localStorage; never synced to the account).
// The key must match the inline no-flicker script in app/layout.tsx.
export const THEME_STORAGE_KEY = "theme-preference";

/** Reads the saved preference, defaulting to "system" when absent/invalid. */
export function readThemePreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemePreference(saved)) return saved;
  } catch {
    // localStorage unavailable (e.g. SSR / privacy mode) -> default.
  }
  return DEFAULT_THEME_PREFERENCE;
}

/**
 * Applies a preference to <html> the same way the inline script does: "light"/
 * "dark" set data-theme (overriding the media query); "system" removes it so
 * prefers-color-scheme takes over.
 */
export function applyThemePreference(preference: ThemePreference): void {
  const root = document.documentElement;
  if (preference === "light" || preference === "dark") {
    root.setAttribute("data-theme", preference);
  } else {
    root.removeAttribute("data-theme");
  }
}

/** Persists + applies a preference immediately. */
export function saveThemePreference(preference: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Best-effort persistence; still apply for this session.
  }
  applyThemePreference(preference);
}
