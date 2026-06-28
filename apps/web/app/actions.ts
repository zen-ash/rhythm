"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  CreateTaskSchema,
  UpdateTaskSchema,
  createClientActionId,
  getRolloverTargetDate,
  getTodayDateString,
} from "@productivity/shared";
import {
  startTimer,
  pauseTimer,
  resumeTimer,
  endTimer,
  fetchActiveFocusSession,
} from "@productivity/supabase";
import { createClient } from "@/lib/supabase/server";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }
  return { supabase, user };
}

function fail(message: string): never {
  redirect(`/?error=${encodeURIComponent(message)}`);
}

export async function createTask(formData: FormData) {
  const { supabase, user } = await requireUser();

  const parsed = CreateTaskSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description")?.toString().trim() || undefined,
    scheduled_date:
      formData.get("scheduled_date")?.toString() || getTodayDateString(),
  });
  if (!parsed.success) {
    fail(parsed.error.issues[0]?.message ?? "Invalid task");
  }

  const { error } = await supabase.from("tasks").insert({
    user_id: user.id,
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    status: parsed.data.status,
    scheduled_date: parsed.data.scheduled_date,
  });
  if (error) {
    fail(error.message);
  }

  revalidatePath("/");
  revalidatePath("/upcoming");
}

export async function toggleTaskStatus(formData: FormData) {
  const { supabase } = await requireUser();

  const current = formData.get("status")?.toString();
  const next = current === "completed" ? "todo" : "completed";

  const parsed = UpdateTaskSchema.safeParse({
    id: formData.get("id"),
    status: next,
  });
  if (!parsed.success) {
    fail("Invalid task");
  }

  const { error } = await supabase
    .from("tasks")
    .update({
      status: parsed.data.status,
      completed_at: next === "completed" ? new Date().toISOString() : null,
    })
    .eq("id", parsed.data.id);
  if (error) {
    fail(error.message);
  }

  // If we just completed the task that owns the active timer, stop that session
  // too (reuses the existing end_timer cleanup). Otherwise the banner — driven
  // by fetchActiveFocusSession — would keep running and survive a refresh.
  if (next === "completed") {
    const active = await fetchActiveFocusSession(supabase);
    if (active && active.task_id === parsed.data.id) {
      try {
        await endTimer(supabase, active.id, createClientActionId());
      } catch {
        // Best-effort: completion already succeeded; a stale/raced end is fine.
      }
    }
  }

  revalidatePath("/");
  revalidatePath("/upcoming");
}

export async function deleteTask(formData: FormData) {
  const { supabase } = await requireUser();

  const parsed = UpdateTaskSchema.pick({ id: true }).safeParse({
    id: formData.get("id"),
  });
  if (!parsed.success) {
    fail("Invalid task");
  }

  const { error } = await supabase
    .from("tasks")
    .delete()
    .eq("id", parsed.data.id);
  if (error) {
    fail(error.message);
  }

  revalidatePath("/");
  revalidatePath("/upcoming");
}

export async function updateTask(formData: FormData) {
  const { supabase } = await requireUser();

  const rawRecurrence = formData.get("recurrence_rule")?.toString();
  const parsed = UpdateTaskSchema.safeParse({
    id: formData.get("id"),
    title: formData.get("title"),
    description: formData.get("description")?.toString().trim() || null,
    scheduled_date: formData.get("scheduled_date"),
    // "none" (or anything not daily/weekly) clears recurrence.
    recurrence_rule:
      rawRecurrence === "daily" || rawRecurrence === "weekly"
        ? rawRecurrence
        : null,
  });
  if (!parsed.success) {
    fail(parsed.error.issues[0]?.message ?? "Invalid task");
  }

  const { id, title, scheduled_date } = parsed.data;
  if (!title || !scheduled_date) {
    fail("Title is required");
  }

  // Only title/description/scheduled_date/recurrence_rule change here — status &
  // completed_at are preserved (completion stays the separate toggle).
  const { error } = await supabase
    .from("tasks")
    .update({
      title,
      description: parsed.data.description ?? null,
      scheduled_date,
      recurrence_rule: parsed.data.recurrence_rule ?? null,
    })
    .eq("id", id);
  if (error) {
    fail(error.message);
  }

  revalidatePath("/");
  revalidatePath("/upcoming");
}

// --- Rollover: in-place scheduled_date bump (no clone, no new table) ---------

export async function moveOverdueTask(formData: FormData) {
  const { supabase } = await requireUser();

  const target =
    formData.get("target")?.toString() === "tomorrow" ? "tomorrow" : "today";
  const parsed = UpdateTaskSchema.safeParse({
    id: formData.get("id"),
    scheduled_date: getRolloverTargetDate(target),
  });
  if (!parsed.success) {
    fail("Invalid task");
  }

  const { error } = await supabase
    .from("tasks")
    .update({ scheduled_date: parsed.data.scheduled_date })
    .eq("id", parsed.data.id);
  if (error) {
    fail(error.message);
  }

  revalidatePath("/");
  revalidatePath("/upcoming");
}

// --- Timer actions (use the guarded RPCs, never raw focus_sessions writes) ---

export async function startTimerAction(formData: FormData) {
  const { supabase } = await requireUser();
  const taskId = formData.get("task_id")?.toString();
  if (!taskId) {
    fail("Missing task");
  }
  try {
    await startTimer(supabase, taskId, createClientActionId());
  } catch (e) {
    fail(e instanceof Error ? e.message : "Could not start timer");
  }
  revalidatePath("/");
}

export async function pauseTimerAction(formData: FormData) {
  const { supabase } = await requireUser();
  const sessionId = formData.get("session_id")?.toString();
  if (!sessionId) {
    fail("Missing session");
  }
  try {
    await pauseTimer(supabase, sessionId, createClientActionId());
  } catch (e) {
    fail(e instanceof Error ? e.message : "Could not pause timer");
  }
  revalidatePath("/");
}

export async function resumeTimerAction(formData: FormData) {
  const { supabase } = await requireUser();
  const sessionId = formData.get("session_id")?.toString();
  if (!sessionId) {
    fail("Missing session");
  }
  try {
    await resumeTimer(supabase, sessionId, createClientActionId());
  } catch (e) {
    fail(e instanceof Error ? e.message : "Could not resume timer");
  }
  revalidatePath("/");
}

export async function endTimerAction(formData: FormData) {
  const { supabase } = await requireUser();
  const sessionId = formData.get("session_id")?.toString();
  if (!sessionId) {
    fail("Missing session");
  }
  try {
    await endTimer(supabase, sessionId, createClientActionId());
  } catch (e) {
    fail(e instanceof Error ? e.message : "Could not end timer");
  }
  revalidatePath("/");
}
