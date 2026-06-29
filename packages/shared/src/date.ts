/**
 * Minimal date helpers. Phase 3 keeps date math simple: a task's day is the
 * local calendar date formatted as YYYY-MM-DD. Timezone-aware rollover is a
 * later phase — there is intentionally no timezone logic here.
 */

/** Formats a Date as a local YYYY-MM-DD string. */
export function toDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Today's local calendar date as YYYY-MM-DD. */
export function getTodayDateString(now: Date = new Date()): string {
  return toDateString(now);
}

/** Parses a YYYY-MM-DD string into a Date at local midnight. */
export function parseDateString(dateString: string): Date {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

/** Returns a YYYY-MM-DD string shifted by `days` (local calendar). */
export function addDaysToDateString(dateString: string, days: number): string {
  const date = parseDateString(dateString);
  date.setDate(date.getDate() + days);
  return toDateString(date);
}

/** Tomorrow's local calendar date as YYYY-MM-DD. */
export function getTomorrowDateString(now: Date = new Date()): string {
  return toDateString(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
}

/** True if `dateString` (YYYY-MM-DD) is before the local today. */
export function isPastDate(
  dateString: string,
  today: string = getTodayDateString(),
): boolean {
  return dateString < today;
}

/** Resolves the in-place rollover target date for a "today"/"tomorrow" move. */
export function getRolloverTargetDate(
  target: "today" | "tomorrow",
  now: Date = new Date(),
): string {
  return target === "tomorrow"
    ? getTomorrowDateString(now)
    : getTodayDateString(now);
}

/**
 * Friendly label for a single date in inputs/rows: "Today", "Tomorrow", else a
 * compact label like "Mon, Jun 29". Keeps the underlying value as YYYY-MM-DD.
 */
export function getFriendlyDateLabel(
  dateString: string,
  today: string = getTodayDateString(),
): string {
  if (dateString === today) return "Today";
  if (dateString === addDaysToDateString(today, 1)) return "Tomorrow";
  return parseDateString(dateString).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/**
 * Minimal header label for an Upcoming date group: "Tomorrow" for tomorrow's
 * local date, otherwise a calm readable label like "Thursday, Oct 12". Uses the
 * runtime's default locale; pure (no React).
 */
export function getUpcomingDateLabel(
  dateString: string,
  today: string = getTodayDateString(),
): string {
  if (dateString === addDaysToDateString(today, 1)) return "Tomorrow";
  return parseDateString(dateString).toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}
