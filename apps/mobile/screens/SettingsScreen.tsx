import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  THEME_PREFERENCES,
  type ThemeColors,
  type ThemePreference,
} from "@productivity/shared";
import WeeklyReviewScreen from "./WeeklyReviewScreen";
import { supabase } from "../lib/supabase";
import { useTheme, useThemePreference } from "../lib/theme";
import { safeAsync } from "../lib/safeAsync";
import { clearOutbox } from "../lib/outbox";
import { clearTodaySnapshot } from "../lib/todayCache";
import { clearUpcomingSnapshot } from "../lib/upcomingCache";
import { clearHistorySnapshot } from "../lib/historyCache";
import {
  disableNotifications,
  enableNotifications,
  isNotificationsEnabled,
} from "../lib/notifications";

const THEME_LABEL: Record<ThemePreference, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

export default function SettingsScreen() {
  const c = useTheme();
  const styles = useMemo(() => createStyles(c), [c]);
  const insets = useSafeAreaInsets();
  const [themePref, setThemePref] = useThemePreference();

  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [notifyOn, setNotifyOn] = useState(false);
  const [notifyBusy, setNotifyBusy] = useState(false);
  const [notifyMsg, setNotifyMsg] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await safeAsync("get session", () =>
        supabase.auth.getSession(),
      );
      setEmail(res?.data.session?.user.email ?? "");
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      setNotifyOn(await isNotificationsEnabled());
    })();
  }, []);

  async function setNotifications(next: boolean) {
    if (notifyBusy) return;
    setNotifyBusy(true);
    setNotifyMsg(null);
    try {
      if (next) {
        const result = await enableNotifications();
        if (result === "enabled") {
          setNotifyOn(true);
        } else {
          setNotifyOn(false);
          setNotifyMsg("Allow notifications in iOS Settings to enable reminders.");
        }
      } else {
        await disableNotifications();
        setNotifyOn(false);
      }
    } finally {
      setNotifyBusy(false);
    }
  }

  async function doDelete() {
    setBusy(true);
    setError(null);
    try {
      const res = await supabase.auth.getSession();
      const token = res.data.session?.access_token;
      const { error: fnError } = await supabase.functions.invoke(
        "delete-account",
        {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        },
      );
      if (fnError) {
        setError("Could not delete account. Please try again.");
        setBusy(false);
        return;
      }
      // Clear local-only state, then sign out (App switches to AuthScreen).
      await clearOutbox();
      await clearTodaySnapshot();
      await clearUpcomingSnapshot();
      await clearHistorySnapshot();
      await supabase.auth.signOut();
    } catch {
      setError("Could not delete account. Please try again.");
      setBusy(false);
    }
  }

  function confirmDelete() {
    Alert.alert(
      "Delete account",
      "This permanently deletes your data and cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => void doDelete(),
        },
      ],
    );
  }

  // Weekly Review opens in-place within the Settings tab (no extra navigator).
  if (reviewOpen) {
    return <WeeklyReviewScreen onClose={() => setReviewOpen(false)} />;
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 24 }]}>
      <Text style={styles.title}>Settings</Text>

      <View style={styles.field}>
        <Text style={styles.label}>Email</Text>
        <Text style={styles.value}>{email}</Text>
      </View>

      <Pressable
        style={styles.button}
        hitSlop={8}
        onPress={() => setReviewOpen(true)}
      >
        <Text style={styles.buttonText}>Weekly review</Text>
      </Pressable>

      <View style={styles.field}>
        <Text style={styles.label}>Appearance</Text>
        <View style={styles.segment}>
          {THEME_PREFERENCES.map((option) => {
            const selected = themePref === option;
            return (
              <Pressable
                key={option}
                style={[styles.segmentItem, selected && styles.segmentItemOn]}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setThemePref(option)}
              >
                <Text
                  style={[
                    styles.segmentText,
                    selected && styles.segmentTextOn,
                  ]}
                >
                  {THEME_LABEL[option]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Notifications</Text>
        <View style={styles.segment}>
          {[
            { on: false, label: "Off" },
            { on: true, label: "On" },
          ].map((opt) => {
            const selected = notifyOn === opt.on;
            return (
              <Pressable
                key={opt.label}
                style={[styles.segmentItem, selected && styles.segmentItemOn]}
                hitSlop={8}
                disabled={notifyBusy}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => void setNotifications(opt.on)}
              >
                <Text
                  style={[
                    styles.segmentText,
                    selected && styles.segmentTextOn,
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.hint}>
          Daily 9:00 AM reminder and a 1-hour timer alert.
        </Text>
        {notifyMsg ? <Text style={styles.hint}>{notifyMsg}</Text> : null}
      </View>

      <Pressable
        style={styles.button}
        hitSlop={8}
        onPress={() =>
          void safeAsync("sign out", () => supabase.auth.signOut())
        }
      >
        <Text style={styles.buttonText}>Sign out</Text>
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={styles.dangerButton}
        hitSlop={8}
        disabled={busy}
        onPress={confirmDelete}
      >
        <Text style={styles.dangerText}>Delete account</Text>
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
      gap: 24,
    },
    title: { fontSize: 22, fontWeight: "600", color: c.text },
    field: { gap: 4 },
    label: {
      fontSize: 12,
      letterSpacing: 0.4,
      textTransform: "uppercase",
      color: c.subtle,
    },
    value: { fontSize: 15, color: c.text },
    segment: {
      flexDirection: "row",
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 6,
      overflow: "hidden",
      alignSelf: "flex-start",
    },
    segmentItem: {
      minHeight: 44,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 18,
    },
    segmentItemOn: { backgroundColor: c.text },
    segmentText: { fontSize: 14, color: c.mutedText },
    segmentTextOn: { color: c.background },
    hint: { fontSize: 12, color: c.subtle },
    button: {
      minHeight: 44,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 6,
      paddingHorizontal: 16,
      alignSelf: "flex-start",
    },
    buttonText: { fontSize: 15, color: c.text },
    dangerButton: {
      minHeight: 44,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 1,
      borderColor: c.danger,
      borderRadius: 6,
      paddingHorizontal: 16,
      alignSelf: "flex-start",
    },
    dangerText: { fontSize: 15, color: c.danger },
    error: { fontSize: 13, color: c.danger },
  });
