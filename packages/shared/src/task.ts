import { z } from "zod";
import { TASK_STATUSES } from "./status";

/** Strict YYYY-MM-DD calendar date string (no timezone math here). */
export const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date");

/** Task status, mirroring the Postgres `task_status` enum. */
export const taskStatusSchema = z.enum(TASK_STATUSES);

/** Recurrence rule, mirroring the tasks.recurrence_rule CHECK constraint. */
export const recurrenceRuleSchema = z.enum(["daily", "weekly"]);

/**
 * Validates input for creating a task. `user_id` is NOT part of this schema —
 * it is always set server-side from the authenticated user, never trusted from
 * the client.
 */
export const CreateTaskSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(500),
  description: z.string().trim().max(5000).optional(),
  status: taskStatusSchema.default("todo"),
  scheduled_date: dateStringSchema,
  recurrence_rule: recurrenceRuleSchema.nullable().optional(),
});

export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;

/** Validates a partial task update; `id` identifies the row. */
export const UpdateTaskSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1, "Title is required").max(500).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  status: taskStatusSchema.optional(),
  scheduled_date: dateStringSchema.optional(),
  recurrence_rule: recurrenceRuleSchema.nullable().optional(),
});

export type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>;

/** A set of tasks that share one scheduled_date, for grouped (Upcoming) display. */
export interface DateGroup<T> {
  date: string;
  tasks: T[];
}

/**
 * Groups tasks by their scheduled_date, preserving the input order both across
 * groups and within each group. Callers should pre-sort by
 * (scheduled_date asc, sort_order asc) so groups come out chronologically. Pure
 * and generic — no React/date math here.
 */
export function groupTasksByScheduledDate<T extends { scheduled_date: string }>(
  tasks: T[],
): DateGroup<T>[] {
  const groups: DateGroup<T>[] = [];
  const byDate = new Map<string, DateGroup<T>>();
  for (const task of tasks) {
    let group = byDate.get(task.scheduled_date);
    if (!group) {
      group = { date: task.scheduled_date, tasks: [] };
      byDate.set(task.scheduled_date, group);
      groups.push(group);
    }
    group.tasks.push(task);
  }
  return groups;
}
