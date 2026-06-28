"use client";

import type { CSSProperties } from "react";

// Calm, themed fallback for any render/runtime error in a route segment, so a
// crash never leaves a blank white screen. Uses the locked design tokens.
const styles: Record<string, CSSProperties> = {
  main: {
    minHeight: "100dvh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    fontFamily: "system-ui, sans-serif",
    background: "var(--canvas)",
    color: "var(--text)",
  },
  card: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    alignItems: "center",
    textAlign: "center",
    maxWidth: 360,
  },
  text: { margin: 0, fontSize: 15, color: "var(--text)" },
  button: {
    border: "1px solid var(--border)",
    background: "none",
    color: "var(--text)",
    fontSize: 14,
    padding: "8px 14px",
    borderRadius: 8,
    cursor: "pointer",
  },
};

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main style={styles.main}>
      <div className="workspace-sm" style={styles.card}>
        <p style={styles.text}>Something went wrong. Please reload.</p>
        <button
          className="btn-outline"
          style={styles.button}
          onClick={() => reset()}
        >
          Reload
        </button>
      </div>
    </main>
  );
}
