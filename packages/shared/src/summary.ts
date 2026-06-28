import { addDaysToDateString, parseDateString, toDateString } from "./date";
import { TASK_STATUS } from "./status";

/**
 * Half-open local-day range as ISO timestamps, for querying timestamptz columns
 * (ended_at / completed_at): `>= start AND < end`. MVP uses local boundaries.
 */
export interface DayRange {
  /** Inclusive lower bound (local start of day, ISO). */
  start: string;
  /** Exclusive upper bound (local start of next day, ISO). */
  end: string;
}

export function getLocalDayRange(date: Date = new Date()): DayRange {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

/** Trailing 7-day window: local today plus the previous 6 local days. */
export interface WeekRange {
  /** First day (YYYY-MM-DD), = today − 6. */
  startDate: string;
  /** Last day (YYYY-MM-DD), = today. */
  endDate: string;
  /** Inclusive lower bound for timestamptz columns (ISO, start of startDate). */
  startIso: string;
  /** Exclusive upper bound for timestamptz columns (ISO, start of tomorrow). */
  endIso: string;
}

export function getTrailingWeekRange(now: Date = new Date()): WeekRange {
  const endDate = toDateString(now);
  const startDate = addDaysToDateString(endDate, -6);
  return {
    startDate,
    endDate,
    startIso: getLocalDayRange(parseDateString(startDate)).start,
    endIso: getLocalDayRange(now).end,
  };
}

/** Subtle range label for the review header, e.g. "Jun 19 – Jun 25". */
export function formatReviewRange(startDate: string, endDate: string): string {
  const opts = { month: "short", day: "numeric" } as const;
  const start = parseDateString(startDate).toLocaleDateString(undefined, opts);
  const end = parseDateString(endDate).toLocaleDateString(undefined, opts);
  return `${start} – ${end}`;
}

/** Human-friendly focus duration for the ledger, e.g. "1h 23m", "12m", "0m". */
export function formatFocusDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  if (safe === 0) return "0m";
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${safe}s`;
}

/**
 * Formats a timestamp as a subtle 12-hour clock label, e.g. "2:15 PM". Done
 * manually (not toLocaleTimeString) so web SSR and mobile render identically.
 */
export function formatCompletedTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const ampm = d.getHours() >= 12 ? "PM" : "AM";
  const hour12 = d.getHours() % 12 || 12;
  return `${hour12}:${minutes} ${ampm}`;
}

/** Sums accumulated_seconds across (completed) focus sessions. */
export function calculateDailyFocusTotal(
  sessions: ReadonlyArray<{ accumulated_seconds: number }>,
): number {
  return sessions.reduce((sum, s) => sum + (s.accumulated_seconds || 0), 0);
}

/** Counts tasks whose status is completed. */
export function calculateCompletedTaskCount(
  tasks: ReadonlyArray<{ status: string }>,
): number {
  return tasks.filter((t) => t.status === TASK_STATUS.COMPLETED).length;
}
