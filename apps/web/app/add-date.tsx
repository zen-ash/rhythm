"use client";

import type { CSSProperties } from "react";
import { useState } from "react";
import { getFriendlyDateLabel } from "@productivity/shared";

/**
 * Friendly scheduled-date control for the add-task form. Shows a natural label
 * ("Today" / "Tomorrow" / "Mon, Jun 29") while the real native date picker sits
 * transparently on top, so it stays fully usable and still submits a YYYY-MM-DD
 * value under name="scheduled_date".
 */
const styles: Record<string, CSSProperties> = {
  wrap: {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    border: "1px solid var(--border)",
    borderRadius: 6,
    padding: "10px 12px",
    background: "var(--bg)",
    color: "var(--text)",
    fontSize: 15,
    whiteSpace: "nowrap",
    cursor: "pointer",
  },
  label: { pointerEvents: "none" },
  input: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    margin: 0,
    padding: 0,
    border: "none",
    opacity: 0,
    cursor: "pointer",
  },
};

export default function AddDate({ defaultValue }: { defaultValue: string }) {
  const [value, setValue] = useState(defaultValue);

  return (
    <label style={styles.wrap}>
      <span style={styles.label}>{getFriendlyDateLabel(value)}</span>
      <input
        style={styles.input}
        type="date"
        name="scheduled_date"
        value={value}
        aria-label="Scheduled date"
        onChange={(e) => setValue(e.target.value || defaultValue)}
        onClick={(e) => {
          try {
            e.currentTarget.showPicker();
          } catch {
            // Older browsers: clicking still focuses the native input.
          }
        }}
      />
    </label>
  );
}
