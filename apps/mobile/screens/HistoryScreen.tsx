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
  addDaysToDateString,
  formatCompletedTime,
  formatFocusDuration,
  getLocalDayRange,
  getTodayDateString,
  isConnectivityError,
  parseDateString,
  type ThemeColors,
} from "@productivity/shared";
import { supabase } from "../lib/supabase";
import { useTheme } from "../lib/theme";
import {
  loadHistorySnapshot,
  saveHistorySnapshot,
  type CompletedTaskItem,
} from "../lib/historyCache";

export default function HistoryScreen() {
  const c = useTheme();
  const styles = useMemo(() => createStyles(c), [c]);
  const insets = useSafeAreaInsets();

  const today = getTodayDateString();
  const [selected, setSelected] = useState(today);
  const [tasks, setTasks] = useState<CompletedTaskItem[]>([]);
  const [totalFocus, setTotalFocus] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    // Guarded so an offline/failed read can't crash the screen or leave the
    // spinner stuck. On success we cache this day; on failure we fall back to
    // the cached snapshot for this exact date (else an empty day).
    try {
      const { start, end } = getLocalDayRange(parseDateString(selected));

      const [taskRes, sessionRes] = await Promise.all([
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

      // 0-rows is a valid empty day; a real error means we couldn't read.
      if (taskRes.error || sessionRes.error) {
        throw taskRes.error ?? sessionRes.error;
      }

      // Per-task focus for the day (sum of that task's completed sessions),
      // reusing the same sessions query that drives the daily total.
      const focusByTask = new Map<string, number>();
      let total = 0;
      for (const s of sessionRes.data ?? []) {
        const secs = s.accumulated_seconds || 0;
        total += secs;
        focusByTask.set(s.task_id, (focusByTask.get(s.task_id) ?? 0) + secs);
      }

      const items: CompletedTaskItem[] = (taskRes.data ?? []).map((t) => ({
        id: t.id,
        title: t.title,
        completed_at: t.completed_at,
        focusSeconds: focusByTask.get(t.id) ?? 0,
      }));

      setTasks(items);
      setTotalFocus(total);
      void saveHistorySnapshot({
        date: selected,
        tasks: items,
        totalFocusSeconds: total,
      });
    } catch (e) {
      if (isConnectivityError(e)) {
        console.warn("Offline/network request failed during history load");
      } else {
        console.error("Unexpected error during history load", e);
      }
      // Quiet recovery: show the cached snapshot for this date if we have one,
      // otherwise a clean empty day (never stale data from another date).
      const cached = await loadHistorySnapshot(selected);
      setTasks(cached?.tasks ?? []);
      setTotalFocus(cached?.totalFocusSeconds ?? 0);
    } finally {
      setLoading(false);
    }
  }, [selected]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 24 }]}>
      <Text style={styles.title}>History</Text>

      <View style={styles.dateNav}>
        <Pressable
          style={styles.navHit}
          hitSlop={12}
          onPress={() => setSelected(addDaysToDateString(selected, -1))}
        >
          <Text style={styles.dateLink}>‹ Prev</Text>
        </Pressable>
        <Text style={styles.dateLabel}>
          {selected === today ? "Today" : selected}
        </Text>
        <Pressable
          style={styles.navHit}
          hitSlop={12}
          onPress={() => setSelected(addDaysToDateString(selected, 1))}
        >
          <Text style={styles.dateLink}>Next ›</Text>
        </Pressable>
      </View>

      <Text style={styles.total}>
        Total focus {formatFocusDuration(totalFocus)}
      </Text>

      {loading ? (
        <ActivityIndicator color={c.text} style={styles.loader} />
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Completed</Text>
            {tasks.length === 0 ? (
              <Text style={styles.empty}>No tasks completed on this date.</Text>
            ) : (
              tasks.map((t) => (
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
    title: { fontSize: 22, fontWeight: "600", color: c.text, marginBottom: 24 },
    dateNav: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 20,
    },
    navHit: { minHeight: 44, justifyContent: "center", paddingHorizontal: 4 },
    dateLink: { fontSize: 13, color: c.mutedText },
    dateLabel: { fontSize: 15, color: c.text },
    total: { fontSize: 15, color: c.text, marginBottom: 24 },
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
      justifyContent: "space-between",
      gap: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    rowMain: { flex: 1, fontSize: 14, color: c.text },
    rowMeta: { fontSize: 13, color: c.subtle },
  });
