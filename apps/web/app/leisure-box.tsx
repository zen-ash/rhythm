"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useState } from "react";
import { formatElapsedTime, formatFocusDuration } from "@productivity/shared";

/**
 * Leisure stopwatch — turn it on while watching YouTube / doing non-productive
 * things; it tracks today / this-week / this-month leisure totals.
 *
 * Device-local (localStorage) and timestamp-based: a running session keeps
 * counting across reloads or a closed tab (elapsed is derived from the stored
 * start time, never from a JS interval), and a 1s tick only refreshes the
 * displayed value. Not synced to other devices.
 */

const STORAGE_KEY = "leisure:v1";

interface LeisureStore {
  /** The in-progress session's start time (ms epoch), or null when stopped. */
  running: { startedAt: number } | null;
  /** Completed leisure seconds bucketed by local day (YYYY-MM-DD). */
  days: Record<string, number>;
}

const EMPTY: LeisureStore = { running: null, days: {} };

function loadStore(): LeisureStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LeisureStore;
      if (parsed && typeof parsed === "object") {
        return { running: parsed.running ?? null, days: parsed.days ?? {} };
      }
    }
  } catch {
    // Corrupt/blocked storage -> start clean.
  }
  return EMPTY;
}

function saveStore(store: LeisureStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Best-effort persistence.
  }
}

function dayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Local Monday-of-this-week key, so "Week" means the current calendar week. */
function weekStartKey(now: Date): string {
  const offset = (now.getDay() + 6) % 7; // 0 = Monday
  return dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset));
}

const styles: Record<string, CSSProperties> = {
  header: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12,
  },
  title: {
    margin: 0,
    fontSize: 16,
    fontWeight: 600,
    letterSpacing: "-0.01em",
    color: "var(--text)",
  },
  hint: { fontSize: 12, color: "var(--subtle)" },
  body: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    marginTop: 16,
  },
  clockRow: { display: "flex", alignItems: "center", gap: 16 },
  clock: {
    fontSize: 33,
    fontWeight: 300,
    fontVariantNumeric: "tabular-nums",
    letterSpacing: 1,
    color: "var(--text)",
    margin: 0,
  },
  primary: {
    border: "1px solid var(--text)",
    background: "var(--text)",
    color: "var(--bg)",
    borderRadius: 8,
    padding: "9px 22px",
    fontSize: 14,
    cursor: "pointer",
  },
  outline: {
    border: "1px solid var(--border)",
    background: "none",
    color: "var(--text)",
    borderRadius: 8,
    padding: "9px 22px",
    fontSize: 14,
    cursor: "pointer",
  },
  stats: { display: "flex", flexWrap: "wrap", gap: 8 },
};

export default function LeisureBox() {
  const [store, setStore] = useState<LeisureStore>(EMPTY);
  const [, setTick] = useState(0);

  // Load persisted state after mount (keeps SSR/first render = empty, no
  // hydration mismatch).
  useEffect(() => {
    setStore(loadStore());
  }, []);

  // Display-only 1s refresh while a session is running.
  useEffect(() => {
    if (!store.running) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [store.running]);

  const start = useCallback(() => {
    setStore((prev) => {
      if (prev.running) return prev;
      const next: LeisureStore = { ...prev, running: { startedAt: Date.now() } };
      saveStore(next);
      return next;
    });
  }, []);

  const stop = useCallback(() => {
    setStore((prev) => {
      if (!prev.running) return prev;
      const seconds = Math.max(
        0,
        Math.floor((Date.now() - prev.running.startedAt) / 1000),
      );
      const key = dayKey(new Date(prev.running.startedAt));
      const next: LeisureStore = {
        running: null,
        days: { ...prev.days, [key]: (prev.days[key] ?? 0) + seconds },
      };
      saveStore(next);
      return next;
    });
  }, []);

  const now = new Date();
  const todayKey = dayKey(now);
  const weekKey = weekStartKey(now);
  const monthPrefix = todayKey.slice(0, 7);

  const running = store.running;
  const sessionSeconds = running
    ? Math.max(0, Math.floor((Date.now() - running.startedAt) / 1000))
    : 0;

  let today = store.days[todayKey] ?? 0;
  let week = 0;
  let month = 0;
  for (const [key, value] of Object.entries(store.days)) {
    if (key >= weekKey && key <= todayKey) week += value;
    if (key.startsWith(monthPrefix)) month += value;
  }

  // Add the live, not-yet-banked session to whichever periods its start falls in.
  if (running) {
    const startKey = dayKey(new Date(running.startedAt));
    if (startKey === todayKey) today += sessionSeconds;
    if (startKey >= weekKey && startKey <= todayKey) week += sessionSeconds;
    if (startKey.startsWith(monthPrefix)) month += sessionSeconds;
  }

  return (
    <section className="subcard">
      <div style={styles.header}>
        <h2 style={styles.title}>Leisure</h2>
        <span style={styles.hint}>Time spent off task</span>
      </div>

      <div style={styles.body}>
        <div style={styles.clockRow}>
          <p style={styles.clock}>{formatElapsedTime(sessionSeconds)}</p>
          <button
            className={running ? "btn-outline" : "btn-primary"}
            style={running ? styles.outline : styles.primary}
            type="button"
            onClick={running ? stop : start}
          >
            {running ? "Stop break" : "Start break"}
          </button>
        </div>

        <div style={styles.stats}>
          <span className="pill">Today {formatFocusDuration(today)}</span>
          <span className="pill">Week {formatFocusDuration(week)}</span>
          <span className="pill">Month {formatFocusDuration(month)}</span>
        </div>
      </div>
    </section>
  );
}
