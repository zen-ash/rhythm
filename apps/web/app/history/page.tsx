import type { CSSProperties } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  addDaysToDateString,
  formatCompletedTime,
  formatFocusDuration,
  getLocalDayRange,
  getTodayDateString,
  parseDateString,
} from "@productivity/shared";
import { createClient } from "@/lib/supabase/server";
import MainNav from "../main-nav";

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
  title: { margin: 0, fontSize: 22, fontWeight: 600 },
  dateNav: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dateLabel: { fontSize: 15, color: "var(--text)" },
  dateLink: { fontSize: 13, color: "var(--muted)", textDecoration: "none" },
  total: { fontSize: 15, color: "var(--text)", margin: 0 },
  sectionLabel: {
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: "var(--subtle)",
    margin: "0 0 8px",
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    padding: "10px 0",
    borderBottom: "1px solid var(--border)",
    fontSize: 14,
  },
  rowMain: { flex: 1, minWidth: 0, overflowWrap: "anywhere", color: "var(--text)" },
  rowMeta: { color: "var(--subtle)", fontSize: 13, whiteSpace: "nowrap" },
  empty: { color: "var(--subtle)", fontSize: 14 },
};

export const metadata = { title: "History" };
export const dynamic = "force-dynamic";

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const today = getTodayDateString();
  const selected =
    params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
      ? params.date
      : today;
  const { start, end } = getLocalDayRange(parseDateString(selected));

  const [tasksRes, sessionsRes] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, title, completed_at")
      .eq("status", "completed")
      .gte("completed_at", start)
      .lt("completed_at", end)
      .order("completed_at", { ascending: false }),
    supabase
      .from("focus_sessions")
      .select("task_id, accumulated_seconds")
      .eq("status", "completed")
      .gte("ended_at", start)
      .lt("ended_at", end),
  ]);

  const completedTasks = tasksRes.data ?? [];
  const sessions = sessionsRes.data ?? [];

  // Per-task focus for the day (sum of that task's completed sessions ended
  // today). Reuses the same sessions query that drives the daily total.
  const focusByTask = new Map<string, number>();
  let totalFocus = 0;
  for (const s of sessions) {
    const secs = s.accumulated_seconds || 0;
    totalFocus += secs;
    focusByTask.set(s.task_id, (focusByTask.get(s.task_id) ?? 0) + secs);
  }

  return (
    <main style={styles.main}>
      <div className="workspace workspace-wide" style={styles.column}>
        <MainNav />

        <h1 style={styles.title}>History</h1>

        <div style={styles.dateNav}>
          <Link
            className="nav-link"
            style={styles.dateLink}
            href={`/history?date=${addDaysToDateString(selected, -1)}`}
          >
            ‹ Prev
          </Link>
          <span style={styles.dateLabel}>
            {selected === today ? "Today" : selected}
          </span>
          <Link
            className="nav-link"
            style={styles.dateLink}
            href={`/history?date=${addDaysToDateString(selected, 1)}`}
          >
            Next ›
          </Link>
        </div>

        <p style={styles.total}>Total focus {formatFocusDuration(totalFocus)}</p>

        <section>
          <p style={styles.sectionLabel}>Completed</p>
          {completedTasks.length === 0 ? (
            <p style={styles.empty}>No tasks completed on this date.</p>
          ) : (
            completedTasks.map((task) => {
              const focusSeconds = focusByTask.get(task.id) ?? 0;
              return (
                <div key={task.id} style={styles.row}>
                  <span style={styles.rowMain}>{task.title}</span>
                  <span className="pill">
                    {formatCompletedTime(task.completed_at)}
                    {focusSeconds > 0
                      ? ` · Focused ${formatFocusDuration(focusSeconds)}`
                      : ""}
                  </span>
                </div>
              );
            })
          )}
        </section>
      </div>
    </main>
  );
}
