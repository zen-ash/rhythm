/**
 * Status constants/types mirroring the Postgres enums defined in the initial
 * Supabase migration. Pure TypeScript — no runtime dependencies. Keep these in
 * lockstep with `task_status` and `focus_session_status` in the migration.
 */

// --- Task status (enum task_status) -----------------------------------------
export const TASK_STATUS = {
  TODO: "todo",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
} as const;

export type TaskStatus = (typeof TASK_STATUS)[keyof typeof TASK_STATUS];

export const TASK_STATUSES = [
  TASK_STATUS.TODO,
  TASK_STATUS.IN_PROGRESS,
  TASK_STATUS.COMPLETED,
] as const satisfies readonly TaskStatus[];

// --- Focus session status (enum focus_session_status) ------------------------
export const FOCUS_SESSION_STATUS = {
  RUNNING: "running",
  PAUSED: "paused",
  COMPLETED: "completed",
  ABANDONED: "abandoned",
} as const;

export type FocusSessionStatus =
  (typeof FOCUS_SESSION_STATUS)[keyof typeof FOCUS_SESSION_STATUS];

export const FOCUS_SESSION_STATUSES = [
  FOCUS_SESSION_STATUS.RUNNING,
  FOCUS_SESSION_STATUS.PAUSED,
  FOCUS_SESSION_STATUS.COMPLETED,
  FOCUS_SESSION_STATUS.ABANDONED,
] as const satisfies readonly FocusSessionStatus[];

/**
 * Statuses that count as an "active" timer. Matches the partial unique index
 * `focus_sessions_one_active_per_user` — at most one such session per user.
 */
export const ACTIVE_FOCUS_SESSION_STATUSES = [
  FOCUS_SESSION_STATUS.RUNNING,
  FOCUS_SESSION_STATUS.PAUSED,
] as const satisfies readonly FocusSessionStatus[];

/**
 * Timer action types written to `timer_action_logs.action_type`, paired with a
 * `client_action_id` for idempotent retries. Logic lands in a later phase.
 */
export const TIMER_ACTION_TYPE = {
  START: "start",
  PAUSE: "pause",
  RESUME: "resume",
  END: "end",
} as const;

export type TimerActionType =
  (typeof TIMER_ACTION_TYPE)[keyof typeof TIMER_ACTION_TYPE];
