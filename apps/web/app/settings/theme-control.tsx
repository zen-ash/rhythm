"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import {
  DEFAULT_THEME_PREFERENCE,
  THEME_PREFERENCES,
  type ThemePreference,
} from "@productivity/shared";
import { readThemePreference, saveThemePreference } from "@/lib/theme";

const LABEL: Record<ThemePreference, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

const styles: Record<string, CSSProperties> = {
  field: { display: "flex", flexDirection: "column", gap: 8 },
  label: {
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: "var(--subtle)",
  },
  segment: {
    display: "inline-flex",
    border: "1px solid var(--border)",
    borderRadius: 6,
    overflow: "hidden",
    alignSelf: "flex-start",
  },
  item: {
    border: "none",
    background: "none",
    color: "var(--muted)",
    fontSize: 14,
    padding: "8px 16px",
    cursor: "pointer",
  },
  itemOn: {
    border: "none",
    background: "var(--text)",
    color: "var(--bg)",
    fontSize: 14,
    padding: "8px 16px",
    cursor: "pointer",
  },
};

export default function ThemeControl() {
  // Render the default on the server / first paint to match SSR, then sync to
  // the saved value after mount (no hydration mismatch — this is the highlight
  // only; the actual theme is already applied by the inline script in <head>).
  const [preference, setPreference] =
    useState<ThemePreference>(DEFAULT_THEME_PREFERENCE);

  useEffect(() => {
    setPreference(readThemePreference());
  }, []);

  function choose(next: ThemePreference) {
    setPreference(next);
    saveThemePreference(next);
  }

  return (
    <div style={styles.field}>
      <span style={styles.label}>Appearance</span>
      <div style={styles.segment} role="group" aria-label="Appearance">
        {THEME_PREFERENCES.map((option) => {
          const selected = preference === option;
          return (
            <button
              key={option}
              type="button"
              className={selected ? undefined : "seg-item"}
              style={selected ? styles.itemOn : styles.item}
              aria-pressed={selected}
              onClick={() => choose(option)}
            >
              {LABEL[option]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
