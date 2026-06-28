/**
 * Grayscale-first theme tokens shared by web and mobile. One quiet "accent"
 * (the strong foreground used for the primary button) — no colorful themes.
 * Pure data: no React / Next / Expo / Supabase imports.
 */
export interface ThemeColors {
  /** Page background. */
  background: string;
  /** Slightly raised surface (inputs, cards). */
  surface: string;
  /** Primary text. */
  text: string;
  /** Secondary, still-readable text. */
  mutedText: string;
  /** Faint text: labels, placeholders, done/▢ affordances. */
  subtle: string;
  /** Hairline borders and row dividers. */
  border: string;
  /** Error / destructive text. */
  danger: string;
  /** Primary action color (button background); pair its label with `background`. */
  accent: string;
}

export const lightTheme: ThemeColors = {
  background: "#ffffff",
  surface: "#f7f7f8",
  text: "#111111",
  mutedText: "#666666",
  subtle: "#999999",
  border: "#e5e5e5",
  danger: "#b00020",
  accent: "#111111",
};

export const darkTheme: ThemeColors = {
  background: "#0b0b0c",
  surface: "#161617",
  text: "#f2f2f2",
  mutedText: "#a8a8ad",
  subtle: "#74747a",
  border: "#2a2a2c",
  danger: "#ff6b6b",
  accent: "#f2f2f2",
};

export type ColorSchemeName = "light" | "dark" | null | undefined;

/** Resolves a system color-scheme value to a theme (defaults to light). */
export function getTheme(scheme: ColorSchemeName): ThemeColors {
  return scheme === "dark" ? darkTheme : lightTheme;
}

/**
 * A user's chosen appearance. "system" defers to the OS / prefers-color-scheme;
 * "light"/"dark" force that mode regardless of the system setting. This is a
 * device-local preference — it is NOT synced to the account.
 */
export type ThemePreference = "light" | "dark" | "system";

export const THEME_PREFERENCES: readonly ThemePreference[] = [
  "system",
  "light",
  "dark",
];

/** Default when no saved preference exists. */
export const DEFAULT_THEME_PREFERENCE: ThemePreference = "system";

/** True for any value we recognise as a stored preference. */
export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

/**
 * Resolves a preference + the current system scheme down to "light"/"dark".
 * Pure: shared by web and mobile so the two stay in lockstep.
 */
export function resolveScheme(
  preference: ThemePreference,
  system: ColorSchemeName,
): "light" | "dark" {
  if (preference === "light") return "light";
  if (preference === "dark") return "dark";
  return system === "dark" ? "dark" : "light";
}

/** Resolves a preference + system scheme straight to theme colors. */
export function resolveTheme(
  preference: ThemePreference,
  system: ColorSchemeName,
): ThemeColors {
  return getTheme(resolveScheme(preference, system));
}
