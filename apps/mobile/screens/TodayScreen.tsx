import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  CreateTaskSchema,
  OUTBOX_ACTION,
  RECURRENCE_OPTIONS,
  RECURRENCE_OPTION_LABEL,
  calculateDailyFocusTotal,
  calculateElapsedSeconds,
  createClientActionId,
  createUuid,
  formatElapsedTime,
  formatFocusDuration,
  fromRecurrenceOption,
  getLocalDayRange,
  getRolloverTargetDate,
  getTodayDateString,
  isConnectivityError,
  parseDateString,
  toDateString,
  toRecurrenceOption,
  type OutboxItem,
  type RecurrenceRule,
  type ThemeColors,
} from "@productivity/shared";
import {
  endTimer,
  fetchActiveFocusSession,
  pauseTimer,
  resumeTimer,
  startTimer,
  type FocusSession,
  type Tables,
} from "@productivity/supabase";
import { supabase } from "../lib/supabase";
import { enqueue, flushOutbox, getOutboxCount } from "../lib/outbox";
import { loadTodaySnapshot, saveTodaySnapshot } from "../lib/todayCache";
import { safeAsync } from "../lib/safeAsync";
import { useTheme } from "../lib/theme";
import {
  cancelRunawayTimerAlert,
  scheduleRunawayTimerAlert,
} from "../lib/notifications";

type Task = Tables<"tasks">;

type TaskOpResult = { error: { code?: string; message: string } | null };

export default function TodayScreen() {
  const c = useTheme();
  const styles = useMemo(() => createStyles(c), [c]);
  const insets = useSafeAreaInsets();

  const today = getTodayDateString();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeSession, setActiveSession] = useState<FocusSession | null>(null);
  const [summary, setSummary] = useState({
    focusSeconds: 0,
    sessionCount: 0,
    taskCount: 0,
  });
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [, setTick] = useState(0);

  const scheduledDate = toDateString(date);

  // Refs let mutateTasks persist a snapshot without re-creating callbacks when
  // activeSession/summary change.
  const activeSessionRef = useRef(activeSession);
  const summaryRef = useRef(summary);
  useEffect(() => {
    activeSessionRef.current = activeSession;
  }, [activeSession]);
  useEffect(() => {
    summaryRef.current = summary;
  }, [summary]);

  // Apply an optimistic change to the task list AND persist it to the cached
  // snapshot, so the change survives an offline app restart. The next successful
  // load() overwrites this with authoritative server state.
  const mutateTasks = useCallback((updater: (prev: Task[]) => Task[]) => {
    setTasks((prev) => {
      const next = updater(prev);
      void saveTodaySnapshot({
        tasks: next,
        activeSession: activeSessionRef.current,
        summary: summaryRef.current,
        ts: Date.now(),
      });
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    // Whole body guarded: nothing here may reject (callers use void load()).
    try {
      // Best-effort: retry queued offline actions (flushOutbox never throws).
      setPendingCount(await flushOutbox());

      const dayRange = getLocalDayRange(new Date());
      const [taskResult, active, sessionsToday, completedToday] =
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

      // Offline / failed fetch: keep the last known tasks on screen instead of
      // blanking them out. The cached snapshot covers a cold offline start.
      if (taskResult.error) {
        setLoading(false);
        return;
      }

      const nextTasks = taskResult.data ?? [];
      const nextSummary = {
        focusSeconds: calculateDailyFocusTotal(sessionsToday.data ?? []),
        sessionCount: sessionsToday.data?.length ?? 0,
        taskCount: completedToday.data?.length ?? 0,
      };

      // Reconcile timer vs. task state: if the timed task has been completed
      // (e.g. completed offline and just synced), stop the lingering focus
      // session here — the single online place that ends it — so the banner
      // can't resurrect after a refetch/restart. Idempotent + best-effort.
      let resolvedActive = active;
      if (resolvedActive) {
        const sessionId = resolvedActive.id;
        const { data: timedTask } = await supabase
          .from("tasks")
          .select("status")
          .eq("id", resolvedActive.task_id)
          .maybeSingle();
        if (timedTask?.status === "completed") {
          await safeAsync("end completed-task timer", () =>
            endTimer(supabase, sessionId, createClientActionId()),
          );
          resolvedActive = null;
        }
      }

      setTasks(nextTasks);
      setActiveSession(resolvedActive);
      setSummary(nextSummary);
      setLoading(false);

      void saveTodaySnapshot({
        tasks: nextTasks,
        activeSession: resolvedActive,
        summary: nextSummary,
        ts: Date.now(),
      });
    } catch (e) {
      // Keep current state visible; log calmly so Expo shows no red overlay.
      if (isConnectivityError(e)) {
        console.warn("Offline/network request failed during load");
      } else {
        console.error("Unexpected error during load", e);
      }
      setLoading(false);
    }
  }, [today]);

  // Show the last cached snapshot immediately (offline-friendly), then refresh.
  useEffect(() => {
    let active = true;
    void (async () => {
      const snapshot = await loadTodaySnapshot();
      if (active && snapshot) {
        setTasks(snapshot.tasks);
        setActiveSession(snapshot.activeSession);
        setSummary(snapshot.summary);
      }
      await load();
    })();
    return () => {
      active = false;
    };
  }, [load]);

  // Realtime: refetch when this user's tasks OR focus sessions change anywhere.
  useEffect(() => {
    let mounted = true;
    let channel: RealtimeChannel | undefined;

    void (async () => {
      const sessionRes = await safeAsync("realtime session", () =>
        supabase.auth.getSession(),
      );
      const user = sessionRes?.data.session?.user;
      if (!user || !mounted) return;

      channel = supabase
        .channel("today-changes")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "tasks",
            filter: `user_id=eq.${user.id}`,
          },
          () => void load(),
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "focus_sessions",
            filter: `user_id=eq.${user.id}`,
          },
          () => void load(),
        )
        .subscribe();
    })();

    return () => {
      mounted = false;
      const ch = channel;
      if (ch) {
        void safeAsync("remove channel", () => supabase.removeChannel(ch));
      }
    };
  }, [load]);

  // Safety net: refetch when the app returns to the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void load();
    });
    return () => sub.remove();
  }, [load]);

  // Local 1s tick for the display ONLY while running (DB is not updated here).
  useEffect(() => {
    if (activeSession?.status !== "running") return;
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [activeSession?.status]);

  const onChangeDate = useCallback(
    (event: DateTimePickerEvent, selected?: Date) => {
      if (event.type === "set" && selected) {
        setDate(selected);
      }
    },
    [],
  );

  // Runs a task write; if it fails for connectivity reasons, queues it in the
  // outbox to retry later. Server (logical) errors are surfaced, not queued.
  const queueAction = useCallback(async (item: OutboxItem) => {
    await safeAsync("queue action", async () => {
      await enqueue(item);
      setPendingCount(await getOutboxCount());
    });
  }, []);

  const attemptOrQueue = useCallback(
    async (op: () => PromiseLike<TaskOpResult>, item: OutboxItem) => {
      setError(null);
      let shouldQueue = false;
      try {
        const { error } = await op();
        if (error) {
          if (isConnectivityError(error)) {
            shouldQueue = true;
          } else {
            // Real server error (has a Postgres code) -> calm, minimal message.
            console.error("Task action failed", error);
            setError("Something went wrong. Please try again.");
          }
        }
      } catch {
        // postgrest returns server errors; a *throw* here is a transport
        // failure -> queue for later and stay calm.
        console.warn("Offline/network request failed during task action");
        shouldQueue = true;
      }
      if (shouldQueue) {
        await queueAction(item);
      }
      await load();
    },
    [load, queueAction],
  );

  const addTask = useCallback(async () => {
    const parsed = CreateTaskSchema.safeParse({
      title,
      scheduled_date: scheduledDate,
    });
    if (!parsed.success) return;

    setBusy(true);
    const nowIso = new Date().toISOString();
    // Build everything (incl. a valid client-generated UUID) BEFORE any network
    // call, so the queued item is identical to the live insert on retry.
    const payload = {
      id: createUuid(),
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      status: parsed.data.status,
      scheduled_date: parsed.data.scheduled_date,
    };
    const item: OutboxItem = {
      localId: createClientActionId(),
      type: OUTBOX_ACTION.CREATE_TASK,
      payload,
      createdAt: nowIso,
      retryCount: 0,
    };
    setTitle("");
    setDate(new Date());
    try {
      // getSession is offline-safe (local read); wrapped so a token-refresh
      // attempt can never throw an uncaught network error.
      const sessionRes = await safeAsync("get session", () =>
        supabase.auth.getSession(),
      );
      const user = sessionRes?.data.session?.user;

      // Optimistic: show it immediately (same id as the insert/queue payload).
      // Only if it belongs in the Today/Overdue view (today or a past date); a
      // future-dated task isn't due today and shouldn't appear here.
      if (payload.scheduled_date <= today) {
        const optimisticTask: Task = {
          id: payload.id,
          user_id: user?.id ?? "",
          title: payload.title,
          description: payload.description,
          status: payload.status,
          scheduled_date: payload.scheduled_date,
          recurrence_rule: null,
          spawned_from_task_id: null,
          completed_at: null,
          sort_order: 0,
          created_at: nowIso,
          updated_at: nowIso,
        };
        mutateTasks((prev) => [...prev, optimisticTask]);
      }

      if (!user) {
        // No reachable session (offline) -> queue directly; flush sets user_id.
        await queueAction(item);
        await load();
        return;
      }
      await attemptOrQueue(
        () => supabase.from("tasks").insert({ user_id: user.id, ...payload }),
        item,
      );
    } finally {
      setBusy(false);
    }
  }, [title, scheduledDate, today, attemptOrQueue, queueAction, load, mutateTasks]);

  const runTimerAction = useCallback(
    async (action: () => Promise<unknown>) => {
      setBusy(true);
      setError(null);
      try {
        await action();
        await load();
      } catch (e) {
        if (isConnectivityError(e)) {
          console.warn("Offline/network request failed during timer action");
          setError("Could not sync yet. Will retry.");
        } else {
          console.error("Timer action failed", e);
          setError(e instanceof Error ? e.message : "Timer action failed");
        }
      } finally {
        // Always clear busy, even on error — otherwise disabled={busy} sticks
        // and the timer controls become permanently untappable.
        setBusy(false);
      }
    },
    [load],
  );

  const onToggle = useCallback(
    async (task: Task) => {
      const next = task.status === "completed" ? "todo" : "completed";
      const completed_at =
        next === "completed" ? new Date().toISOString() : null;
      // Completing the timed task: cancel its runaway alert and clear the active
      // timer locally + in cache immediately, so the banner disappears and a
      // restart-before-sync can't resurrect it. Clearing the ref first means the
      // snapshot mutateTasks writes below persists activeSession: null. The DB
      // session is ended by load()'s reconciliation on the next online refetch.
      if (next === "completed" && activeSessionRef.current?.task_id === task.id) {
        void cancelRunawayTimerAlert();
        activeSessionRef.current = null;
        setActiveSession(null);
      }
      // Optimistic: flip status locally (no fake "pending" status).
      mutateTasks((prev) =>
        prev.map((t) =>
          t.id === task.id ? { ...t, status: next, completed_at } : t,
        ),
      );
      await attemptOrQueue(
        () =>
          supabase
            .from("tasks")
            .update({ status: next, completed_at })
            .eq("id", task.id),
        {
          localId: createClientActionId(),
          type: OUTBOX_ACTION.TOGGLE_TASK,
          payload: { id: task.id, status: next, completed_at },
          createdAt: new Date().toISOString(),
          retryCount: 0,
        },
      );
    },
    [attemptOrQueue, mutateTasks],
  );

  const onRemove = useCallback(
    async (id: string) => {
      // If this task's timer is the active one, drop its runaway alert too.
      if (activeSessionRef.current?.task_id === id) {
        void cancelRunawayTimerAlert();
      }
      // Optimistic: drop it from the list immediately.
      mutateTasks((prev) => prev.filter((t) => t.id !== id));
      await attemptOrQueue(() => supabase.from("tasks").delete().eq("id", id), {
        localId: createClientActionId(),
        type: OUTBOX_ACTION.DELETE_TASK,
        payload: { id },
        createdAt: new Date().toISOString(),
        retryCount: 0,
      });
    },
    [attemptOrQueue, mutateTasks],
  );

  const onMove = useCallback(
    async (id: string, target: "today" | "tomorrow") => {
      const scheduled_date = getRolloverTargetDate(target);
      // Optimistic: moving to Today re-dates it (jumps to the Today section);
      // moving to Tomorrow means it's no longer due today -> remove from view.
      if (target === "today") {
        mutateTasks((prev) =>
          prev.map((t) => (t.id === id ? { ...t, scheduled_date } : t)),
        );
      } else {
        mutateTasks((prev) => prev.filter((t) => t.id !== id));
      }
      await attemptOrQueue(
        () => supabase.from("tasks").update({ scheduled_date }).eq("id", id),
        {
          localId: createClientActionId(),
          type: OUTBOX_ACTION.MOVE_TASK,
          payload: { id, scheduled_date },
          createdAt: new Date().toISOString(),
          retryCount: 0,
        },
      );
    },
    [attemptOrQueue, mutateTasks],
  );

  const onEdit = useCallback(
    async (
      id: string,
      fields: {
        title: string;
        description: string | null;
        scheduled_date: string;
        recurrence_rule: RecurrenceRule | null;
      },
    ) => {
      // Optimistic: apply the edit locally. If the new date is in the future it
      // leaves the Today/Overdue view (mirrors the Today-query behavior).
      const stillInView = fields.scheduled_date <= today;
      mutateTasks((prev) =>
        stillInView
          ? prev.map((t) => (t.id === id ? { ...t, ...fields } : t))
          : prev.filter((t) => t.id !== id),
      );
      await attemptOrQueue(
        () =>
          supabase
            .from("tasks")
            .update({
              title: fields.title,
              description: fields.description,
              scheduled_date: fields.scheduled_date,
              recurrence_rule: fields.recurrence_rule,
            })
            .eq("id", id),
        {
          localId: createClientActionId(),
          type: OUTBOX_ACTION.EDIT_TASK,
          payload: { id, ...fields },
          createdAt: new Date().toISOString(),
          retryCount: 0,
        },
      );
    },
    [today, attemptOrQueue, mutateTasks],
  );

  const overdue = tasks.filter((t) => t.scheduled_date < today);
  const todayTasks = tasks.filter((t) => t.scheduled_date >= today);

  const activeTaskTitle = activeSession
    ? (tasks.find((t) => t.id === activeSession.task_id)?.title ??
      "Focus session")
    : "";
  const displaySeconds = activeSession
    ? calculateElapsedSeconds(activeSession, new Date())
    : 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 24 }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Today</Text>
        <Pressable
          onPress={() =>
            void safeAsync("sign out", () => supabase.auth.signOut())
          }
        >
          <Text style={styles.logout}>Log out</Text>
        </Pressable>
      </View>

      <View style={styles.summary}>
        <Text style={styles.summaryText}>
          Focus {formatFocusDuration(summary.focusSeconds)}
        </Text>
        <Text style={styles.summaryText}>{summary.sessionCount} sessions</Text>
        <Text style={styles.summaryText}>{summary.taskCount} done</Text>
      </View>

      {pendingCount > 0 ? (
        <Text style={styles.pending}>Offline changes pending</Text>
      ) : null}

      {activeSession ? (
        <View style={styles.timer}>
          <Text style={styles.timerTask}>{activeTaskTitle}</Text>
          <Text style={styles.timerTime}>
            {formatElapsedTime(displaySeconds)}
          </Text>
          <View style={styles.timerControls}>
            {activeSession.status === "running" ? (
              <Pressable
                style={styles.timerControl}
                hitSlop={8}
                disabled={busy}
                onPress={() =>
                  void runTimerAction(async () => {
                    await pauseTimer(
                      supabase,
                      activeSession.id,
                      createClientActionId(),
                    );
                    // Paused -> no longer "running an hour"; drop the alert.
                    await cancelRunawayTimerAlert();
                  })
                }
              >
                <Text style={styles.timerButtonText}>Pause</Text>
              </Pressable>
            ) : (
              <Pressable
                style={styles.timerControl}
                hitSlop={8}
                disabled={busy}
                onPress={() =>
                  void runTimerAction(async () => {
                    await resumeTimer(
                      supabase,
                      activeSession.id,
                      createClientActionId(),
                    );
                    // Running again -> restart the 1-hour alert from now.
                    await scheduleRunawayTimerAlert(activeTaskTitle);
                  })
                }
              >
                <Text style={styles.timerButtonText}>Resume</Text>
              </Pressable>
            )}
            <Pressable
              style={styles.timerControl}
              hitSlop={8}
              disabled={busy}
              onPress={() =>
                // Confirm only the final stop/save action (never Pause).
                Alert.alert("End Session", "Finish focusing on this task?", [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "End",
                    style: "destructive",
                    onPress: () =>
                      void runTimerAction(async () => {
                        await endTimer(
                          supabase,
                          activeSession.id,
                          createClientActionId(),
                        );
                        await cancelRunawayTimerAlert();
                      }),
                  },
                ])
              }
            >
              <Text style={styles.timerButtonText}>End Session</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <View style={styles.addSection}>
        <View style={styles.addRow}>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Add a task"
            placeholderTextColor={c.subtle}
            editable={!busy}
            returnKeyType="done"
            onSubmitEditing={() => void addTask()}
          />
          <Pressable
            style={styles.addButton}
            onPress={() => void addTask()}
            disabled={busy || title.trim().length === 0}
          >
            <Text style={styles.addLabel}>Add</Text>
          </Pressable>
        </View>

        <View style={styles.dateRow}>
          <Text style={styles.dateLabel}>Scheduled for</Text>
          <DateTimePicker
            value={date}
            mode="date"
            display="default"
            onChange={onChangeDate}
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      {loading ? (
        <ActivityIndicator color={c.text} style={styles.loader} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          {overdue.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Overdue</Text>
              {overdue.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  busy={busy}
                  canStart={activeSession === null}
                  isActive={activeSession?.task_id === task.id}
                  isOverdue
                  onToggle={onToggle}
                  onRemove={onRemove}
                  onMove={onMove}
                  onEdit={onEdit}
                  onStart={(id, taskTitle) =>
                    void runTimerAction(async () => {
                      await startTimer(supabase, id, createClientActionId());
                      // Cancels any prior alert, then arms a fresh 1-hour one.
                      await scheduleRunawayTimerAlert(taskTitle);
                    })
                  }
                />
              ))}
            </View>
          ) : null}

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Today</Text>
            {todayTasks.length === 0 ? (
              <Text style={styles.empty}>Nothing scheduled.</Text>
            ) : (
              todayTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  busy={busy}
                  canStart={activeSession === null}
                  isActive={activeSession?.task_id === task.id}
                  isOverdue={false}
                  onToggle={onToggle}
                  onRemove={onRemove}
                  onMove={onMove}
                  onEdit={onEdit}
                  onStart={(id, taskTitle) =>
                    void runTimerAction(async () => {
                      await startTimer(supabase, id, createClientActionId());
                      // Cancels any prior alert, then arms a fresh 1-hour one.
                      await scheduleRunawayTimerAlert(taskTitle);
                    })
                  }
                />
              ))
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function TaskRow({
  task,
  busy,
  canStart,
  isActive,
  isOverdue,
  onToggle,
  onRemove,
  onMove,
  onEdit,
  onStart,
}: {
  task: Task;
  busy: boolean;
  canStart: boolean;
  isActive: boolean;
  isOverdue: boolean;
  onToggle: (task: Task) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, target: "today" | "tomorrow") => void;
  onEdit: (
    id: string,
    fields: {
      title: string;
      description: string | null;
      scheduled_date: string;
      recurrence_rule: RecurrenceRule | null;
    },
  ) => void;
  onStart: (id: string, title: string) => void;
}) {
  const c = useTheme();
  const styles = useMemo(() => createStyles(c), [c]);

  const done = task.status === "completed";

  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editDesc, setEditDesc] = useState(task.description ?? "");
  const [editDate, setEditDate] = useState(() =>
    parseDateString(task.scheduled_date),
  );
  const [editRecurrence, setEditRecurrence] = useState(() =>
    toRecurrenceOption(task.recurrence_rule),
  );

  if (editing) {
    return (
      <View style={styles.editBox}>
        <TextInput
          style={styles.editInput}
          value={editTitle}
          onChangeText={setEditTitle}
          placeholder="Title"
          placeholderTextColor={c.subtle}
        />
        <TextInput
          style={styles.editInput}
          value={editDesc}
          onChangeText={setEditDesc}
          placeholder="Notes (optional)"
          placeholderTextColor={c.subtle}
        />
        <View style={styles.dateRow}>
          <Text style={styles.dateLabel}>Scheduled for</Text>
          <DateTimePicker
            value={editDate}
            mode="date"
            display="default"
            onChange={(e, d) => {
              if (e.type === "set" && d) setEditDate(d);
            }}
          />
        </View>
        <View style={styles.recurrenceRow}>
          <Text style={styles.dateLabel}>Repeat</Text>
          <View style={styles.recurrenceSegment}>
            {RECURRENCE_OPTIONS.map((option) => {
              const selected = editRecurrence === option;
              return (
                <Pressable
                  key={option}
                  style={[
                    styles.recurrenceItem,
                    selected && styles.recurrenceItemOn,
                  ]}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setEditRecurrence(option)}
                >
                  <Text
                    style={[
                      styles.recurrenceText,
                      selected && styles.recurrenceTextOn,
                    ]}
                  >
                    {RECURRENCE_OPTION_LABEL[option]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <View style={styles.editActions}>
          <Pressable
            style={styles.editBtn}
            hitSlop={8}
            disabled={editTitle.trim().length === 0}
            onPress={() => {
              onEdit(task.id, {
                title: editTitle.trim(),
                description: editDesc.trim() ? editDesc.trim() : null,
                scheduled_date: toDateString(editDate),
                recurrence_rule: fromRecurrenceOption(editRecurrence),
              });
              setEditing(false);
            }}
          >
            <Text style={styles.editSave}>Save</Text>
          </Pressable>
          <Pressable
            style={styles.editBtn}
            hitSlop={8}
            onPress={() => {
              setEditTitle(task.title);
              setEditDesc(task.description ?? "");
              setEditDate(parseDateString(task.scheduled_date));
              setEditRecurrence(toRecurrenceOption(task.recurrence_rule));
              setEditing(false);
            }}
          >
            <Text style={styles.editCancel}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={isActive ? [styles.row, styles.rowActive] : styles.row}>
      <Pressable
        style={styles.iconHit}
        onPress={() => onToggle(task)}
        hitSlop={{ top: 14, bottom: 14, left: 10, right: 10 }}
      >
        <Text style={styles.toggle}>{done ? "●" : "○"}</Text>
      </Pressable>
      <Pressable
        style={styles.titleHit}
        onPress={() => setEditing(true)}
        hitSlop={{ top: 14, bottom: 14 }}
      >
        <Text style={[styles.taskText, done && styles.taskDone]}>
          {task.title}
        </Text>
      </Pressable>
      {isOverdue ? (
        <>
          <Pressable
            style={styles.move}
            onPress={() => onMove(task.id, "today")}
            hitSlop={{ top: 14, bottom: 14, left: 6, right: 6 }}
          >
            <Text style={styles.moveText}>Today</Text>
          </Pressable>
          <Pressable
            style={styles.move}
            onPress={() => onMove(task.id, "tomorrow")}
            hitSlop={{ top: 14, bottom: 14, left: 6, right: 6 }}
          >
            <Text style={styles.moveText}>Tomorrow</Text>
          </Pressable>
        </>
      ) : canStart && !done ? (
        <Pressable
          style={styles.start}
          onPress={() => onStart(task.id, task.title)}
          hitSlop={{ top: 14, bottom: 14, left: 10, right: 10 }}
          disabled={busy}
        >
          <Text style={styles.startText}>Start</Text>
        </Pressable>
      ) : null}
      <Pressable
        style={styles.iconHit}
        onPress={() => onRemove(task.id)}
        hitSlop={{ top: 14, bottom: 14, left: 10, right: 10 }}
      >
        <Text style={styles.remove}>×</Text>
      </Pressable>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.background,
    paddingHorizontal: 24,
  },
  header: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  title: { fontSize: 22, fontWeight: "600", color: c.text },
  logout: { fontSize: 13, color: c.subtle },
  summary: { flexDirection: "row", gap: 16, marginBottom: 24 },
  summaryText: { fontSize: 13, color: c.mutedText },
  pending: { fontSize: 12, color: c.subtle, marginTop: -12, marginBottom: 16 },
  timer: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 8,
    paddingVertical: 20,
    paddingHorizontal: 24,
    alignItems: "center",
    gap: 10,
    marginBottom: 24,
  },
  timerTask: { fontSize: 13, color: c.subtle },
  timerTime: {
    fontSize: 44,
    fontWeight: "300",
    color: c.text,
    fontVariant: ["tabular-nums"],
    letterSpacing: 1,
  },
  timerControls: { flexDirection: "row", gap: 8, marginTop: 4 },
  timerControl: {
    minHeight: 44,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  timerButtonText: { fontSize: 15, color: c.text },
  addSection: { marginBottom: 24, gap: 10 },
  addRow: { flexDirection: "row", gap: 8 },
  dateRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dateLabel: { fontSize: 13, color: c.subtle },
  error: { fontSize: 13, color: c.danger },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: c.text,
  },
  addButton: {
    backgroundColor: c.text,
    borderRadius: 6,
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  addLabel: { color: c.background, fontSize: 15 },
  loader: { marginTop: 24 },
  list: { paddingBottom: 48 },
  section: { marginBottom: 28 },
  sectionLabel: {
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: c.subtle,
    marginBottom: 8,
  },
  empty: { color: c.subtle, fontSize: 14 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  rowActive: {
    backgroundColor: c.surface,
    borderLeftWidth: 2,
    borderLeftColor: c.accent,
    paddingLeft: 8,
    borderRadius: 4,
  },
  iconHit: { minHeight: 44, justifyContent: "center" },
  titleHit: { flex: 1, justifyContent: "center", minHeight: 44 },
  toggle: { fontSize: 16, color: c.text, width: 20, textAlign: "center" },
  taskText: { fontSize: 15, color: c.text },
  taskDone: { color: c.subtle, textDecorationLine: "line-through" },
  start: { minHeight: 44, justifyContent: "center", paddingHorizontal: 4 },
  startText: { fontSize: 14, color: c.mutedText },
  move: { minHeight: 44, justifyContent: "center", paddingHorizontal: 4 },
  moveText: { fontSize: 13, color: c.subtle },
  remove: { fontSize: 16, color: c.subtle },
  editBox: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
    gap: 8,
  },
  editInput: {
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: c.text,
  },
  recurrenceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  recurrenceSegment: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 6,
    overflow: "hidden",
  },
  recurrenceItem: {
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 14,
  },
  recurrenceItemOn: { backgroundColor: c.text },
  recurrenceText: { fontSize: 13, color: c.mutedText },
  recurrenceTextOn: { color: c.background },
  editActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    marginTop: 4,
  },
  editBtn: { minHeight: 44, justifyContent: "center" },
  editSave: { fontSize: 15, color: c.text, fontWeight: "600" },
  editCancel: { fontSize: 15, color: c.subtle },
});
