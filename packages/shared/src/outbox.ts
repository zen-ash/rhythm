import type { TaskStatus } from "./status";
import type { RecurrenceRule } from "./recurrence";

/**
 * Offline outbox types shared by the mobile app. Pure TypeScript — the queue
 * storage and execution live in the mobile layer (it needs AsyncStorage + the
 * Supabase client). Only task actions are modelled here; timer actions are
 * intentionally NOT part of the outbox yet.
 */

export const OUTBOX_ACTION = {
  CREATE_TASK: "create_task",
  TOGGLE_TASK: "toggle_task",
  DELETE_TASK: "delete_task",
  MOVE_TASK: "move_task",
  EDIT_TASK: "edit_task",
} as const;

export type OutboxActionType =
  (typeof OUTBOX_ACTION)[keyof typeof OUTBOX_ACTION];

export interface CreateTaskPayload {
  /** Client-generated task id, so retries are idempotent on the primary key. */
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  scheduled_date: string;
}

export interface ToggleTaskPayload {
  id: string;
  status: TaskStatus;
  completed_at: string | null;
}

export interface DeleteTaskPayload {
  id: string;
}

export interface MoveTaskPayload {
  id: string;
  scheduled_date: string;
}

export interface EditTaskPayload {
  id: string;
  title: string;
  description: string | null;
  scheduled_date: string;
  recurrence_rule: RecurrenceRule | null;
}

interface OutboxBase {
  localId: string;
  createdAt: string;
  retryCount: number;
}

export type OutboxItem =
  | (OutboxBase & {
      type: typeof OUTBOX_ACTION.CREATE_TASK;
      payload: CreateTaskPayload;
    })
  | (OutboxBase & {
      type: typeof OUTBOX_ACTION.TOGGLE_TASK;
      payload: ToggleTaskPayload;
    })
  | (OutboxBase & {
      type: typeof OUTBOX_ACTION.DELETE_TASK;
      payload: DeleteTaskPayload;
    })
  | (OutboxBase & {
      type: typeof OUTBOX_ACTION.MOVE_TASK;
      payload: MoveTaskPayload;
    })
  | (OutboxBase & {
      type: typeof OUTBOX_ACTION.EDIT_TASK;
      payload: EditTaskPayload;
    });

export interface OutboxErrorLike {
  code?: string;
  message?: string;
}

/** Postgres unique violation — e.g. a create retry whose row already landed. */
export function isUniqueViolation(
  error: OutboxErrorLike | null | undefined,
): boolean {
  return error?.code === "23505";
}

/**
 * Heuristic for "the request never reached the server" (connectivity), so the
 * action should be queued rather than surfaced as a hard error.
 *
 * Catches both shapes seen in React Native + Supabase:
 *  - a thrown `TypeError: Network request failed`
 *  - a Supabase error object with no Postgres `code` and a network-ish message
 *
 * A real Postgres/server error always carries a `code`, so it is NOT treated as
 * connectivity.
 */
export function isConnectivityError(error: unknown): boolean {
  if (!error) return false;
  const e = error as { code?: string; name?: string; message?: string };

  // Server responded with a Postgres error code -> not connectivity.
  if (e.code) return false;

  // React Native fetch failures are thrown as a TypeError.
  if (e.name === "TypeError") return true;

  const message = typeof error === "string" ? error : (e.message ?? "");
  return /network request failed|failed to fetch|networkerror|network error|timeout|connection|offline/i.test(
    message,
  );
}
