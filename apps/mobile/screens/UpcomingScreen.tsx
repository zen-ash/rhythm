import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  OUTBOX_ACTION,
  RECURRENCE_OPTIONS,
  RECURRENCE_OPTION_LABEL,
  createClientActionId,
  fromRecurrenceOption,
  getRolloverTargetDate,
  getTodayDateString,
  getUpcomingDateLabel,
  groupTasksByScheduledDate,
  isConnectivityError,
  parseDateString,
  toDateString,
  toRecurrenceOption,
  type OutboxItem,
  type RecurrenceRule,
  type ThemeColors,
} from "@productivity/shared";
import type { Tables } from "@productivity/supabase";
import { supabase } from "../lib/supabase";
import { enqueue, flushOutbox, getOutboxCount } from "../lib/outbox";
import { loadUpcomingSnapshot, saveUpcomingSnapshot } from "../lib/upcomingCache";
import { safeAsync } from "../lib/safeAsync";
import { useTheme } from "../lib/theme";

type Task = Tables<"tasks">;

type TaskOpResult = { error: { code?: string; message: string } | null };

export default function UpcomingScreen() {
  const c = useTheme();
  const styles = useMemo(() => createStyles(c), [c]);
  const insets = useSafeAreaInsets();

  const today = getTodayDateString();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  const load = useCallback(async () => {
    // Fully guarded: callers use void load(); nothing here may reject.
    try {
      setPendingCount(await flushOutbox());

      const { data, error: queryError } = await supabase
        .from("tasks")
        .select("*")
        .gt("scheduled_date", today)
        .neq("status", "completed")
        .order("scheduled_date", { ascending: true })
        .order("sort_order", { ascending: true });

      // Offline / failed fetch: keep the last known list instead of blanking it.
      if (queryError) {
        setLoading(false);
        return;
      }
      const nextTasks = data ?? [];
      setTasks(nextTasks);
      setLoading(false);
      void saveUpcomingSnapshot(nextTasks);
    } catch (e) {
      if (isConnectivityError(e)) {
        console.warn("Offline/network request failed during upcoming load");
      } else {
        console.error("Unexpected error during upcoming load", e);
      }
      setLoading(false);
    }
  }, [today]);

  // Show the last cached snapshot immediately (offline-friendly), then refresh.
  useEffect(() => {
    let active = true;
    void (async () => {
      const snapshot = await loadUpcomingSnapshot();
      if (active && snapshot) setTasks(snapshot.tasks);
      await load();
    })();
    return () => {
      active = false;
    };
  }, [load]);

  // Realtime: refetch when this user's tasks change anywhere.
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
        .channel("upcoming-changes")
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

  const queueAction = useCallback(async (item: OutboxItem) => {
    await safeAsync("queue action", async () => {
      await enqueue(item);
      setPendingCount(await getOutboxCount());
    });
  }, []);

  // Same connectivity-vs-server handling as Today: queue on transport failure,
  // surface a calm message on real server errors, then refetch.
  const attemptOrQueue = useCallback(
    async (op: () => PromiseLike<TaskOpResult>, item: OutboxItem) => {
      setError(null);
      let shouldQueue = false;
      try {
        const { error: opError } = await op();
        if (opError) {
          if (isConnectivityError(opError)) {
            shouldQueue = true;
          } else {
            console.error("Task action failed", opError);
            setError("Something went wrong. Please try again.");
          }
        }
      } catch {
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

  const onToggle = useCallback(
    async (task: Task) => {
      // Upcoming only holds incomplete tasks, so a toggle always completes it —
      // which means it leaves this list. Drop it optimistically.
      const completed_at = new Date().toISOString();
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
      await attemptOrQueue(
        () =>
          supabase
            .from("tasks")
            .update({ status: "completed", completed_at })
            .eq("id", task.id),
        {
          localId: createClientActionId(),
          type: OUTBOX_ACTION.TOGGLE_TASK,
          payload: { id: task.id, status: "completed", completed_at },
          createdAt: new Date().toISOString(),
          retryCount: 0,
        },
      );
    },
    [attemptOrQueue],
  );

  const onRemove = useCallback(
    async (id: string) => {
      setTasks((prev) => prev.filter((t) => t.id !== id));
      await attemptOrQueue(() => supabase.from("tasks").delete().eq("id", id), {
        localId: createClientActionId(),
        type: OUTBOX_ACTION.DELETE_TASK,
        payload: { id },
        createdAt: new Date().toISOString(),
        retryCount: 0,
      });
    },
    [attemptOrQueue],
  );

  const onMoveToToday = useCallback(
    async (id: string) => {
      const scheduled_date = getRolloverTargetDate("today");
      // No longer "upcoming" (it's today now) -> drop from this list.
      setTasks((prev) => prev.filter((t) => t.id !== id));
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
    [attemptOrQueue],
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
      // If the new date is today or earlier it leaves Upcoming; otherwise it
      // stays and re-groups under the new date on the next render.
      const stillUpcoming = fields.scheduled_date > today;
      setTasks((prev) =>
        stillUpcoming
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
    [today, attemptOrQueue],
  );

  const groups = groupTasksByScheduledDate(tasks);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 24 }]}>
      <Text style={styles.title}>Upcoming</Text>

      {pendingCount > 0 ? (
        <Text style={styles.pending}>Offline changes pending</Text>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <ActivityIndicator color={c.text} style={styles.loader} />
      ) : groups.length === 0 ? (
        <Text style={styles.empty}>No upcoming tasks.</Text>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          {groups.map((group) => (
            <View key={group.date} style={styles.section}>
              <Text style={styles.sectionLabel}>
                {getUpcomingDateLabel(group.date, today)}
              </Text>
              {group.tasks.map((task) => (
                <UpcomingRow
                  key={task.id}
                  task={task}
                  onToggle={onToggle}
                  onRemove={onRemove}
                  onMoveToToday={onMoveToToday}
                  onEdit={onEdit}
                />
              ))}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function UpcomingRow({
  task,
  onToggle,
  onRemove,
  onMoveToToday,
  onEdit,
}: {
  task: Task;
  onToggle: (task: Task) => void;
  onRemove: (id: string) => void;
  onMoveToToday: (id: string) => void;
  onEdit: (
    id: string,
    fields: {
      title: string;
      description: string | null;
      scheduled_date: string;
      recurrence_rule: RecurrenceRule | null;
    },
  ) => void;
}) {
  const c = useTheme();
  const styles = useMemo(() => createStyles(c), [c]);

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
    <View style={styles.row}>
      <Pressable
        style={styles.iconHit}
        onPress={() => onToggle(task)}
        hitSlop={{ top: 14, bottom: 14, left: 10, right: 10 }}
      >
        <Text style={styles.toggle}>○</Text>
      </Pressable>
      <Pressable
        style={styles.titleHit}
        onPress={() => setEditing(true)}
        hitSlop={{ top: 14, bottom: 14 }}
      >
        <Text style={styles.taskText}>{task.title}</Text>
      </Pressable>
      <Pressable
        style={styles.move}
        onPress={() => onMoveToToday(task.id)}
        hitSlop={{ top: 14, bottom: 14, left: 6, right: 6 }}
      >
        <Text style={styles.moveText}>Today</Text>
      </Pressable>
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
    title: { fontSize: 22, fontWeight: "600", color: c.text, marginBottom: 24 },
    pending: { fontSize: 12, color: c.subtle, marginTop: -12, marginBottom: 16 },
    error: { fontSize: 13, color: c.danger, marginBottom: 12 },
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
    iconHit: { minHeight: 44, justifyContent: "center" },
    titleHit: { flex: 1, justifyContent: "center", minHeight: 44 },
    toggle: { fontSize: 16, color: c.text, width: 20, textAlign: "center" },
    taskText: { fontSize: 15, color: c.text },
    move: { minHeight: 44, justifyContent: "center", paddingHorizontal: 4 },
    moveText: { fontSize: 13, color: c.subtle },
    remove: { fontSize: 16, color: c.subtle },
    dateRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    dateLabel: { fontSize: 13, color: c.subtle },
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
