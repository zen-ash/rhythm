import { addDaysToDateString } from "./date";

/**
 * Task recurrence (Phase 17). Stored on tasks.recurrence_rule as 'daily' /
 * 'weekly' / null. Respawn pattern: completing a recurring task spawns exactly
 * one next occurrence — there is no monthly/custom recurrence here. Pure
 * TypeScript: no React/Next/Expo/Supabase imports.
 */

export const RECURRENCE_RULE = {
  DAILY: "daily",
  WEEKLY: "weekly",
} as const;

export type RecurrenceRule =
  (typeof RECURRENCE_RULE)[keyof typeof RECURRENCE_RULE];

/** Selectable options in the UI; "none" maps to a stored null. */
export const RECURRENCE_OPTIONS = ["none", "daily", "weekly"] as const;
export type RecurrenceOption = (typeof RECURRENCE_OPTIONS)[number];

export const RECURRENCE_OPTION_LABEL: Record<RecurrenceOption, string> = {
  none: "None",
  daily: "Daily",
  weekly: "Weekly",
};

export function isRecurrenceRule(value: unknown): value is RecurrenceRule {
  return value === "daily" || value === "weekly";
}

/** Stored recurrence_rule (string | null) -> UI option ("none" when absent). */
export function toRecurrenceOption(
  rule: string | null | undefined,
): RecurrenceOption {
  return isRecurrenceRule(rule) ? rule : "none";
}

/** UI option -> stored value (null for "none"). */
export function fromRecurrenceOption(
  option: RecurrenceOption,
): RecurrenceRule | null {
  return option === "none" ? null : option;
}

/**
 * The next scheduled_date for a recurring task: daily -> +1 day, weekly ->
 * +7 days. Local YYYY-MM-DD math (reuses addDaysToDateString). This mirrors the
 * SQL respawn trigger; clients can use it for previews if needed.
 */
export function getNextRecurrenceDate(
  scheduledDate: string,
  rule: RecurrenceRule,
): string {
  return addDaysToDateString(scheduledDate, rule === "weekly" ? 7 : 1);
}
