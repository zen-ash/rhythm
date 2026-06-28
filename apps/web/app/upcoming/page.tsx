import type { CSSProperties } from "react";
import { redirect } from "next/navigation";
import {
  getTodayDateString,
  getUpcomingDateLabel,
  groupTasksByScheduledDate,
} from "@productivity/shared";
import type { Tables } from "@productivity/supabase";
import { createClient } from "@/lib/supabase/server";
import RealtimeTasks from "../realtime-tasks";
import TaskItem from "../task-item";
import MainNav from "../main-nav";

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
  title: { margin: 0, fontSize: 22, fontWeight: 600 },
  group: { display: "flex", flexDirection: "column" },
  groupLabel: {
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: "var(--subtle)",
    margin: "0 0 8px",
  },
  list: { display: "flex", flexDirection: "column" },
  empty: { color: "var(--subtle)", fontSize: 14 },
};

export const metadata = { title: "Upcoming" };

export default async function UpcomingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const today = getTodayDateString();
  const { data } = await supabase
    .from("tasks")
    .select("*")
    .gt("scheduled_date", today)
    .neq("status", "completed")
    .order("scheduled_date", { ascending: true })
    .order("sort_order", { ascending: true });

  const tasks: Task[] = data ?? [];
  const groups = groupTasksByScheduledDate(tasks);

  return (
    <main style={styles.main}>
      <RealtimeTasks userId={user.id} />
      <div className="workspace workspace-wide" style={styles.column}>
        <h1 style={styles.title}>Upcoming</h1>

        <MainNav />

        {groups.length === 0 ? (
          <p style={styles.empty}>No upcoming tasks.</p>
        ) : (
          groups.map((group) => (
            <section key={group.date} style={styles.group}>
              <p style={styles.groupLabel}>
                {getUpcomingDateLabel(group.date, today)}
              </p>
              <div style={styles.list}>
                {group.tasks.map((task) => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    canStart={false}
                    isOverdue={false}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </main>
  );
}
