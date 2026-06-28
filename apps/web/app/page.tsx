import type { CSSProperties } from "react";
import { redirect } from "next/navigation";
import {
  calculateDailyFocusTotal,
  formatFocusDuration,
  getLocalDayRange,
  getTodayDateString,
} from "@productivity/shared";
import {
  fetchActiveFocusSession,
  type Tables,
} from "@productivity/supabase";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./login/actions";
import { createTask } from "./actions";
import RealtimeTasks from "./realtime-tasks";
import ActiveTimer from "./active-timer";
import TaskItem from "./task-item";
import MainNav from "./main-nav";
import SubmitButton from "./submit-button";

type Task = Tables<"tasks">;

const styles: Record<string, CSSProperties> = {
  main: {
    minHeight: "100dvh",
    display: "flex",
    justifyContent: "center",
    padding: "48px 24px",
    fontFamily: "system-ui, sans-serif",
    color: "var(--text)",
    background: "var(--canvas)",
  },
  column: {
    width: "100%",
    maxWidth: 600,
    display: "flex",
    flexDirection: "column",
    gap: 28,
  },
  header: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  title: { margin: 0, fontSize: 22, fontWeight: 600 },
  logout: {
    border: "none",
    background: "none",
    padding: 0,
    color: "var(--subtle)",
    fontSize: 13,
    cursor: "pointer",
  },
  summary: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    fontSize: 13,
    color: "var(--muted)",
    paddingBottom: 4,
  },
  addForm: { display: "flex", gap: 8 },
  input: {
    flex: 1,
    padding: "10px 12px",
    fontSize: 15,
    border: "1px solid var(--border)",
    borderRadius: 6,
    outline: "none",
    color: "var(--text)",
    background: "var(--bg)",
  },
  dateInput: {
    padding: "10px 12px",
    fontSize: 15,
    border: "1px solid var(--border)",
    borderRadius: 6,
    outline: "none",
    color: "var(--text)",
    background: "var(--bg)",
  },
  addButton: {
    padding: "10px 14px",
    fontSize: 15,
    border: "1px solid var(--text)",
    borderRadius: 6,
    background: "var(--text)",
    color: "var(--bg)",
    cursor: "pointer",
  },
  sectionLabel: {
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: "var(--subtle)",
    margin: "0 0 8px",
  },
  list: { display: "flex", flexDirection: "column" },
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 0",
    borderBottom: "1px solid var(--border)",
  },
  toggle: {
    width: 20,
    height: 20,
    lineHeight: "18px",
    textAlign: "center",
    border: "none",
    background: "none",
    padding: 0,
    fontSize: 16,
    color: "var(--text)",
    cursor: "pointer",
  },
  taskText: { flex: 1, fontSize: 15 },
  taskDone: {
    flex: 1,
    fontSize: 15,
    color: "var(--subtle)",
    textDecoration: "line-through",
  },
  startButton: {
    border: "none",
    background: "none",
    color: "var(--muted)",
    fontSize: 13,
    cursor: "pointer",
    padding: 0,
  },
  move: {
    border: "none",
    background: "none",
    color: "var(--subtle)",
    fontSize: 13,
    cursor: "pointer",
    padding: 0,
  },
  remove: {
    border: "none",
    background: "none",
    color: "var(--subtle)",
    fontSize: 16,
    cursor: "pointer",
    padding: 0,
  },
  empty: { color: "var(--subtle)", fontSize: 14 },
  error: { color: "var(--danger)", fontSize: 13, margin: 0 },
};

export const metadata = { title: "Today" };

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const today = getTodayDateString();
  const dayRange = getLocalDayRange(new Date());
  const [tasksResult, activeSession, sessionsToday, completedTasksToday] =
    await Promise.all([
      supabase
        .from("tasks")
        .select("*")
        .or(
          `scheduled_date.eq.${today},and(scheduled_date.lt.${today},status.neq.completed)`,
        )
        .order("scheduled_date", { ascending: true })
        .order("created_at", { ascending: true }),
      fetchActiveFocusSession(supabase),
      supabase
        .from("focus_sessions")
        .select("accumulated_seconds")
        .eq("status", "completed")
        .gte("ended_at", dayRange.start)
        .lt("ended_at", dayRange.end),
      supabase
        .from("tasks")
        .select("id")
        .eq("status", "completed")
        .gte("completed_at", dayRange.start)
        .lt("completed_at", dayRange.end),
    ]);

  const tasks: Task[] = tasksResult.data ?? [];
  const focusSecondsToday = calculateDailyFocusTotal(sessionsToday.data ?? []);
  const sessionCountToday = sessionsToday.data?.length ?? 0;
  const completedCountToday = completedTasksToday.data?.length ?? 0;

  let activeTaskTitle = "Focus session";
  if (activeSession) {
    const { data: activeTask } = await supabase
      .from("tasks")
      .select("title")
      .eq("id", activeSession.task_id)
      .maybeSingle();
    activeTaskTitle = activeTask?.title ?? activeTaskTitle;
  }

  const overdue = tasks.filter((t) => t.scheduled_date < today);
  const todayTasks = tasks.filter((t) => t.scheduled_date >= today);
  const canStart = activeSession === null;
  const activeTaskId = activeSession?.task_id ?? null;

  return (
    <main style={styles.main}>
      <RealtimeTasks userId={user.id} />
      <div className="workspace" style={styles.column}>
        <div style={styles.header}>
          <h1 style={styles.title}>Today</h1>
          <form action={signOut}>
            <SubmitButton className="btn-ghost" style={styles.logout}>
              Log out
            </SubmitButton>
          </form>
        </div>

        <MainNav />

        <div style={styles.summary}>
          <span className="pill">Focus {formatFocusDuration(focusSecondsToday)}</span>
          <span className="pill">{sessionCountToday} sessions</span>
          <span className="pill">{completedCountToday} done</span>
        </div>

        {activeSession ? (
          <ActiveTimer
            sessionId={activeSession.id}
            taskTitle={activeTaskTitle}
            status={activeSession.status}
            accumulatedSeconds={activeSession.accumulated_seconds}
            lastResumedAt={activeSession.last_resumed_at}
          />
        ) : null}

        <form style={styles.addForm} action={createTask}>
          <input
            className="field"
            style={styles.input}
            name="title"
            placeholder="Add a task"
            autoComplete="off"
            required
          />
          <input
            className="field"
            style={styles.dateInput}
            name="scheduled_date"
            type="date"
            defaultValue={today}
          />
          <SubmitButton className="btn-primary" style={styles.addButton}>
            Add
          </SubmitButton>
        </form>

        {error ? <p style={styles.error}>{error}</p> : null}

        {overdue.length > 0 ? (
          <section>
            <p style={styles.sectionLabel}>Overdue</p>
            <div style={styles.list}>
              {overdue.map((task) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  canStart={canStart}
                  isOverdue
                  isActive={task.id === activeTaskId}
                />
              ))}
            </div>
          </section>
        ) : null}

        <section>
          <p style={styles.sectionLabel}>Today</p>
          {todayTasks.length === 0 ? (
            <p style={styles.empty}>Nothing scheduled.</p>
          ) : (
            <div style={styles.list}>
              {todayTasks.map((task) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  canStart={canStart}
                  isOverdue={false}
                  isActive={task.id === activeTaskId}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
