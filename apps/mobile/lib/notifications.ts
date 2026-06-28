import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";

/**
 * Strictly-local notifications (expo-notifications). No remote push, no servers,
 * no DB. Two notifications only:
 *  - a repeating 9:00 AM daily reminder,
 *  - a one-shot "runaway timer" alert 60 min after a timer starts.
 * Every function is best-effort and never throws, so notification failures can't
 * break tasks or the timer.
 */

const ENABLED_KEY = "notifications-enabled:v1";
const DAILY_ID_KEY = "daily-reminder-id:v1";
const RUNAWAY_ID_KEY = "runaway-timer-id:v1";

const DAILY_HOUR = 9;
const DAILY_MINUTE = 0;
const RUNAWAY_DELAY_SECONDS = 60 * 60;

/** Registers how notifications present while the app is foregrounded. Idempotent. */
export function setupNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

export async function isNotificationsEnabled(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ENABLED_KEY)) === "true";
  } catch {
    return false;
  }
}

async function setEnabledFlag(value: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(ENABLED_KEY, value ? "true" : "false");
  } catch {
    // Best-effort.
  }
}

async function hasPermission(): Promise<boolean> {
  try {
    const settings = await Notifications.getPermissionsAsync();
    return settings.granted;
  } catch {
    return false;
  }
}

/** Requests permission only if not already granted (and still askable). */
async function requestPermission(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    const next = await Notifications.requestPermissionsAsync();
    return next.granted;
  } catch {
    return false;
  }
}

// --- Daily reminder ----------------------------------------------------------

/** Schedules the 9:00 AM reminder, cancelling any prior one so it never stacks. */
async function scheduleDailyReminder(): Promise<void> {
  await cancelDailyReminder();
  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: { title: "Good morning", body: "Check your tasks for today." },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: DAILY_HOUR,
        minute: DAILY_MINUTE,
      },
    });
    await AsyncStorage.setItem(DAILY_ID_KEY, id);
  } catch {
    // Best-effort: leave disabled-but-intended; restart reconcile retries.
  }
}

async function cancelDailyReminder(): Promise<void> {
  try {
    const id = await AsyncStorage.getItem(DAILY_ID_KEY);
    if (id) await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // ignore
  }
  try {
    await AsyncStorage.removeItem(DAILY_ID_KEY);
  } catch {
    // ignore
  }
}

// --- Runaway timer alert -----------------------------------------------------

/**
 * Schedules a one-hour "still running" alert for the given task, replacing any
 * existing runaway alert first (only one can exist at a time). No-op unless
 * notifications are enabled and permission is granted.
 */
export async function scheduleRunawayTimerAlert(taskTitle: string): Promise<void> {
  if (!(await isNotificationsEnabled())) return;
  if (!(await hasPermission())) return;
  await cancelRunawayTimerAlert();
  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: "Timer still running!",
        body: `You've been focusing on "${taskTitle}" for an hour. Don't forget to pause or complete it.`,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: RUNAWAY_DELAY_SECONDS,
        repeats: false,
      },
    });
    await AsyncStorage.setItem(RUNAWAY_ID_KEY, id);
  } catch {
    // Best-effort: timer keeps working even if scheduling fails.
  }
}

/** Cancels the pending runaway timer alert, if any. Safe to call unconditionally. */
export async function cancelRunawayTimerAlert(): Promise<void> {
  try {
    const id = await AsyncStorage.getItem(RUNAWAY_ID_KEY);
    if (id) await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // ignore
  }
  try {
    await AsyncStorage.removeItem(RUNAWAY_ID_KEY);
  } catch {
    // ignore
  }
}

// --- Enable / disable (Settings) ---------------------------------------------

export type EnableResult = "enabled" | "denied";

/** Enables notifications: requests permission, then schedules the daily reminder. */
export async function enableNotifications(): Promise<EnableResult> {
  const granted = await requestPermission();
  if (!granted) {
    await setEnabledFlag(false);
    return "denied";
  }
  await setEnabledFlag(true);
  await scheduleDailyReminder();
  return "enabled";
}

/** Disables notifications and cancels everything scheduled. */
export async function disableNotifications(): Promise<void> {
  await setEnabledFlag(false);
  await cancelDailyReminder();
  await cancelRunawayTimerAlert();
}

// --- App startup reconcile ---------------------------------------------------

/**
 * On launch: if enabled and still permitted, ensure exactly one daily reminder
 * (reschedule cancels the old id first). Otherwise cancel any daily reminder and
 * keep the flag honest if permission was revoked in OS settings.
 */
export async function reconcileNotificationsOnStart(): Promise<void> {
  const enabled = await isNotificationsEnabled();
  if (enabled && (await hasPermission())) {
    await scheduleDailyReminder();
  } else {
    if (enabled) await setEnabledFlag(false);
    await cancelDailyReminder();
  }
}
