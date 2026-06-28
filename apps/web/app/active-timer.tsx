"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import {
  calculateElapsedSeconds,
  formatElapsedTime,
  type TimerSessionState,
} from "@productivity/shared";
import { pauseTimerAction, resumeTimerAction, endTimerAction } from "./actions";
import SubmitButton from "./submit-button";

const styles: Record<string, CSSProperties> = {
  wrap: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: "20px 24px",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    alignItems: "center",
  },
  task: { fontSize: 13, color: "var(--subtle)", margin: 0 },
  time: {
    fontSize: 44,
    fontWeight: 300,
    fontVariantNumeric: "tabular-nums",
    letterSpacing: 1,
    margin: 0,
    color: "var(--text)",
  },
  controls: { display: "flex", gap: 8, marginTop: 4 },
  button: {
    border: "none",
    background: "none",
    padding: "6px 10px",
    fontSize: 14,
    color: "var(--text)",
    cursor: "pointer",
  },
};

export default function ActiveTimer({
  sessionId,
  taskTitle,
  status,
  accumulatedSeconds,
  lastResumedAt,
}: {
  sessionId: string;
  taskTitle: string;
  status: TimerSessionState["status"];
  accumulatedSeconds: number;
  lastResumedAt: string | null;
}) {
  const session: TimerSessionState = {
    status,
    accumulated_seconds: accumulatedSeconds,
    last_resumed_at: lastResumedAt,
  };

  const [display, setDisplay] = useState(() =>
    calculateElapsedSeconds(session),
  );

  useEffect(() => {
    setDisplay(calculateElapsedSeconds(session));
    if (status !== "running") return;
    const interval = setInterval(() => {
      setDisplay(calculateElapsedSeconds(session));
    }, 1000);
    return () => clearInterval(interval);
    // Re-derive when the session's timing inputs change.
  }, [status, accumulatedSeconds, lastResumedAt]);

  return (
    <div style={styles.wrap}>
      <p style={styles.task}>{taskTitle}</p>
      <p style={styles.time}>{formatElapsedTime(display)}</p>
      <div style={styles.controls}>
        {status === "running" ? (
          <form action={pauseTimerAction}>
            <input type="hidden" name="session_id" value={sessionId} />
            <SubmitButton className="btn-ghost" style={styles.button}>
              Pause
            </SubmitButton>
          </form>
        ) : (
          <form action={resumeTimerAction}>
            <input type="hidden" name="session_id" value={sessionId} />
            <SubmitButton className="btn-ghost" style={styles.button}>
              Resume
            </SubmitButton>
          </form>
        )}
        <form
          action={endTimerAction}
          onSubmit={(e) => {
            // Confirm only the final stop/save action (never Pause).
            if (!window.confirm("End this focus session?")) {
              e.preventDefault();
            }
          }}
        >
          <input type="hidden" name="session_id" value={sessionId} />
          <SubmitButton className="btn-ghost" style={styles.button}>
            End Session
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
