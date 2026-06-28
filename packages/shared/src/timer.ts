import { createUuid } from "./id";
import { FOCUS_SESSION_STATUS, type FocusSessionStatus } from "./status";

/**
 * Minimal shape needed to derive elapsed time from a focus session. The full
 * row (from the database) is structurally compatible with this.
 */
export interface TimerSessionState {
  status: FocusSessionStatus;
  accumulated_seconds: number;
  last_resumed_at: string | null;
}

/**
 * Derives total elapsed seconds for a session WITHOUT a live DB counter:
 *   accumulated_seconds + (running ? now - last_resumed_at : 0)
 * The database stays the source of truth via timestamps; this is display-only.
 */
export function calculateElapsedSeconds(
  session: TimerSessionState,
  now: Date = new Date(),
): number {
  let elapsed = session.accumulated_seconds;

  if (
    session.status === FOCUS_SESSION_STATUS.RUNNING &&
    session.last_resumed_at
  ) {
    const resumedMs = new Date(session.last_resumed_at).getTime();
    const deltaSeconds = Math.floor((now.getTime() - resumedMs) / 1000);
    if (deltaSeconds > 0) {
      elapsed += deltaSeconds;
    }
  }

  return Math.max(0, Math.floor(elapsed));
}

/** Formats seconds as HH:MM:SS (e.g. 3725 -> "01:02:05"). */
export function formatElapsedTime(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Generates a client action id for timer-action idempotency. Prefers the
 * platform's crypto.randomUUID (web, modern RN); falls back to a v4-style id
 * built from Math.random so it works everywhere (e.g. older Hermes). The value
 * is stored as text, so the exact format is not important — only uniqueness.
 */
export function createClientActionId(): string {
  return createUuid();
}
