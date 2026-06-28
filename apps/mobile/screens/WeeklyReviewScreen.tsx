import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  OUTBOX_ACTION,
  addDaysToDateString,
  createClientActionId,
  formatCompletedTime,
  formatFocusDuration,
  formatReviewRange,
  getTodayDateString,
  getTrailingWeekRange,
  isConnectivityError,
  type ThemeColors,
} from "@productivity/shared";
import { supabase } from "../lib/supabase";
import { enqueue, flushOutbox } from "../lib/outbox";
import { useTheme } from "../lib/theme";

type CompletedItem = {
  id: string;
  title: string;
  completed_at: string | null;
  focusSeconds: number;
};
type UnfinishedItem = { id: string; title: string; scheduled_date: string };

export default function WeeklyReviewScreen({
  onClose,
}: {
  onClose: () => void;
}) {
  const c = useTheme();
  const styles = useMemo(() => createStyles(c), [c]);
  const insets = useSafeAreaInsets();

  const { startDate, endDate, startIso, endIso } = useMemo(
    () => getTrailingWeekRange(),
    [],
  );

  const [completed, setCompleted] = useState<CompletedItem[]>([]);
  const [unfinished, setUnfinished] = useState<UnfinishedItem[]>([]);
  const [totalFocus, setTotalFocus] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleSelected = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Roll the selected unfinished tasks forward by updating ONLY scheduled_date,
  // via per-task MOVE_TASK outbox items (preserves description/recurrence/lineage
  // without a refetch; never spawns or duplicates). Optimistically drop them —
  // once rescheduled they fall outside the trailing-7-day unfinished range.
  const rollover = useCallback(
    async (target: "tomorrow" | "next_week") => {
      if (selected.size === 0) return;
      const scheduled_date = addDaysToDateString(
        getTodayDateString(),
        target === "next_week" ? 7 : 1,
      );
      const ids = [...selected];
      setUnfinished((prev) => prev.filter((t) => !selected.has(t.id)));
      setSelected(new Set());
      for (const id of ids) {
        await enqueue({
          localId: createClientActionId(),
          type: OUTBOX_ACTION.MOVE_TASK,
          payload: { id, scheduled_date },
          createdAt: new Date().toISOString(),
          retryCount: 0,
        });
      }
      // Best-effort online sync; offline keeps the optimistic removal and the
      // queued moves flush later. flushOutbox never throws.
      await flushOutbox();
    },
    [selected],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [completedRes, unfinishedRes, sessionRes] = await Promise.all([
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

      if (completedRes.error || unfinishedRes.error || sessionRes.error) {
        throw completedRes.error ?? unfinishedRes.error ?? sessionRes.error;
      }

      const focusByTask = new Map<string, number>();
      let total = 0;
      for (const s of sessionRes.data ?? []) {
        const secs = s.accumulated_seconds || 0;
        total += secs;
        focusByTask.set(s.task_id, (focusByTask.get(s.task_id) ?? 0) + secs);
      }

      setCompleted(
        (completedRes.data ?? []).map((t) => ({
          id: t.id,
          title: t.title,
          completed_at: t.completed_at,
          focusSeconds: focusByTask.get(t.id) ?? 0,
        })),
      );
      setUnfinished(unfinishedRes.data ?? []);
      setTotalFocus(total);
    } catch (e) {
      if (!isConnectivityError(e)) {
        console.error("Unexpected error during weekly review load", e);
      }
      // Read-only, no offline cache by design -> calm network message.
      setError("Network required for Weekly Review.");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, startIso, endIso]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 24 }]}>
      <Pressable style={styles.backHit} hitSlop={8} onPress={onClose}>
        <Text style={styles.back}>‹ Settings</Text>
      </Pressable>

      <Text style={styles.title}>Review</Text>
      <Text style={styles.range}>
        Past 7 days · {formatReviewRange(startDate, endDate)}
      </Text>

      {loading ? (
        <ActivityIndicator color={c.text} style={styles.loader} />
      ) : error ? (
        <Text style={styles.message}>{error}</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Summary</Text>
            <View style={styles.summary}>
              <Text style={styles.summaryText}>
                {completed.length} completed
              </Text>
              <Text style={styles.summaryText}>
                Focus {formatFocusDuration(totalFocus)}
              </Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Completed</Text>
            {completed.length === 0 ? (
              <Text style={styles.empty}>No tasks completed this week.</Text>
            ) : (
              completed.map((t) => (
                <View key={t.id} style={styles.row}>
                  <Text style={styles.rowMain}>{t.title}</Text>
                  <Text style={styles.rowMeta}>
                    {formatCompletedTime(t.completed_at)}
                    {t.focusSeconds > 0
                      ? ` · Focused ${formatFocusDuration(t.focusSeconds)}`
                      : ""}
                  </Text>
                </View>
              ))
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Unfinished</Text>
            {unfinished.length === 0 ? (
              <Text style={styles.empty}>Nothing unfinished this week.</Text>
            ) : (
              <>
                {unfinished.map((t) => {
                  const checked = selected.has(t.id);
                  return (
                    <Pressable
                      key={t.id}
                      style={styles.row}
                      hitSlop={{ top: 8, bottom: 8 }}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked }}
                      onPress={() => toggleSelected(t.id)}
                    >
                      <Text style={styles.check}>{checked ? "●" : "○"}</Text>
                      <Text style={styles.rowMain}>{t.title}</Text>
                      <Text style={styles.rowMeta}>{t.scheduled_date}</Text>
                    </Pressable>
                  );
                })}
                <View style={styles.rolloverActions}>
                  <Pressable
                    style={[
                      styles.rolloverButton,
                      selected.size === 0 && styles.rolloverDisabled,
                    ]}
                    hitSlop={8}
                    disabled={selected.size === 0}
                    onPress={() => void rollover("tomorrow")}
                  >
                    <Text style={styles.rolloverText}>Move to Tomorrow</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.rolloverButton,
                      selected.size === 0 && styles.rolloverDisabled,
                    ]}
                    hitSlop={8}
                    disabled={selected.size === 0}
                    onPress={() => void rollover("next_week")}
                  >
                    <Text style={styles.rolloverText}>Move to Next week</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </ScrollView>
      )}
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
    backHit: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
    back: { fontSize: 14, color: c.mutedText },
    title: { fontSize: 22, fontWeight: "600", color: c.text, marginTop: 4 },
    range: { fontSize: 13, color: c.subtle, marginTop: 4, marginBottom: 20 },
    loader: { marginTop: 24 },
    message: { fontSize: 14, color: c.subtle, marginTop: 8 },
    list: { paddingBottom: 48 },
    section: { marginBottom: 28 },
    sectionLabel: {
      fontSize: 12,
      letterSpacing: 0.4,
      textTransform: "uppercase",
      color: c.subtle,
      marginBottom: 8,
    },
    summary: { flexDirection: "row", gap: 16 },
    summaryText: { fontSize: 15, color: c.text },
    empty: { color: c.subtle, fontSize: 14 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      minHeight: 44,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    rowMain: { flex: 1, fontSize: 14, color: c.text },
    rowMeta: { fontSize: 13, color: c.subtle },
    check: { fontSize: 15, color: c.text, width: 20, textAlign: "center" },
    rolloverActions: { flexDirection: "row", gap: 10, marginTop: 14 },
    rolloverButton: {
      minHeight: 44,
      justifyContent: "center",
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 6,
      paddingHorizontal: 14,
    },
    rolloverDisabled: { opacity: 0.4 },
    rolloverText: { fontSize: 13, color: c.text },
  });
