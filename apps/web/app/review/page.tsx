import type { CSSProperties } from "react";
import { redirect } from "next/navigation";
import {
  formatCompletedTime,
  formatFocusDuration,
  formatReviewRange,
  getTrailingWeekRange,
} from "@productivity/shared";
import { createClient } from "@/lib/supabase/server";
import MainNav from "../main-nav";
import { rolloverTasks } from "./actions";
import SubmitButton from "../submit-button";

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
  range: { fontSize: 13, color: "var(--subtle)", marginTop: -20 },
  summary: { display: "flex", gap: 8, fontSize: 15, color: "var(--text)" },
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
  selectRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    padding: "10px 0",
    borderBottom: "1px solid var(--border)",
    fontSize: 14,
  },
  selectLabel: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    color: "var(--text)",
    cursor: "pointer",
  },
  checkbox: { accentColor: "var(--accent)", width: 15, height: 15 },
  rolloverActions: { display: "flex", gap: 10, marginTop: 14 },
  rolloverButton: {
    border: "1px solid var(--border)",
    background: "none",
    color: "var(--text)",
    fontSize: 13,
    padding: "8px 12px",
    borderRadius: 6,
    cursor: "pointer",
  },
};

export const metadata = { title: "Review" };
export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { startDate, endDate, startIso, endIso } = getTrailingWeekRange();

  const [completedRes, unfinishedRes, sessionsRes] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, title, completed_at")
      .eq("status", "completed")
      .gte("completed_at", startIso)
      .lt("completed_at", endIso)
      .order("completed_at", { ascending: false }),
    supabase
      .from("tasks")
      .select("id, title, scheduled_date")
      .neq("status", "completed")
      .gte("scheduled_date", startDate)
      .lte("scheduled_date", endDate)
      .order("scheduled_date", { ascending: true }),
    supabase
      .from("focus_sessions")
      .select("task_id, accumulated_seconds")
      .eq("status", "completed")
      .gte("ended_at", startIso)
      .lt("ended_at", endIso),
  ]);

  const completed = completedRes.data ?? [];
  const unfinished = unfinishedRes.data ?? [];
  const sessions = sessionsRes.data ?? [];

  // Per-task + total focus for the week (reuses one sessions query).
  const focusByTask = new Map<string, number>();
  let totalFocus = 0;
  for (const s of sessions) {
    const secs = s.accumulated_seconds || 0;
    totalFocus += secs;
    focusByTask.set(s.task_id, (focusByTask.get(s.task_id) ?? 0) + secs);
  }

  return (
    <main style={styles.main}>
      <div className="workspace workspace-review" style={styles.column}>
        <MainNav />

        <h1 style={styles.title}>Review</h1>
        <p style={styles.range}>Past 7 days · {formatReviewRange(startDate, endDate)}</p>

        <section>
          <p style={styles.sectionLabel}>Summary</p>
          <div style={styles.summary}>
            <span className="pill">{completed.length} completed</span>
            <span className="pill">Focus {formatFocusDuration(totalFocus)}</span>
          </div>
        </section>

        <section>
          <p style={styles.sectionLabel}>Completed</p>
          {completed.length === 0 ? (
            <p style={styles.empty}>No tasks completed this week.</p>
          ) : (
            completed.map((task) => {
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

        <section>
          <p style={styles.sectionLabel}>Unfinished</p>
          {unfinished.length === 0 ? (
            <p style={styles.empty}>Nothing unfinished this week.</p>
          ) : (
            <form action={rolloverTasks}>
              {unfinished.map((task) => (
                <div key={task.id} className="task-row" style={styles.selectRow}>
                  <label className="checkbox-label">
                    <input
                      className="checkbox-input"
                      type="checkbox"
                      name="ids"
                      value={task.id}
                    />
                    <span className="checkbox-box" aria-hidden="true" />
                    {task.title}
                  </label>
                  <span className="pill">{task.scheduled_date}</span>
                </div>
              ))}
              <div style={styles.rolloverActions}>
                <SubmitButton
                  className="btn-outline"
                  style={styles.rolloverButton}
                  name="target"
                  value="tomorrow"
                >
                  Move to Tomorrow
                </SubmitButton>
                <SubmitButton
                  className="btn-outline"
                  style={styles.rolloverButton}
                  name="target"
                  value="next_week"
                >
                  Move to Next week
                </SubmitButton>
              </div>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
