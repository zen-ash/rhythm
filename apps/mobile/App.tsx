import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
} from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { Session } from "@supabase/supabase-js";
import { getTheme } from "@productivity/shared";
import { useResolvedScheme } from "./lib/theme";
import {
  reconcileNotificationsOnStart,
  setupNotificationHandler,
} from "./lib/notifications";
import { clearOutbox } from "./lib/outbox";
import { clearTodaySnapshot } from "./lib/todayCache";
import { clearUpcomingSnapshot } from "./lib/upcomingCache";
import { clearHistorySnapshot } from "./lib/historyCache";
import ErrorBoundary from "./components/ErrorBoundary";
import { supabase } from "./lib/supabase";
import AuthScreen from "./screens/AuthScreen";
import TodayScreen from "./screens/TodayScreen";
import UpcomingScreen from "./screens/UpcomingScreen";
import HistoryScreen from "./screens/HistoryScreen";
import SettingsScreen from "./screens/SettingsScreen";

type RootTabParamList = {
  Today: undefined;
  Upcoming: undefined;
  History: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

// Register the local-notification presentation behavior once at startup.
setupNotificationHandler();

export default function App() {
  const scheme = useResolvedScheme();
  const c = getTheme(scheme);

  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Restores any persisted session from AsyncStorage on launch.
    supabase.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session);
        setLoading(false);
      })
      .catch(() => {
        // Couldn't read the session (rare) -> don't hang on the splash spinner.
        setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      // On sign-out, drop all local user data so queued outbox items can't later
      // flush under a different user and cached views can't leak across accounts.
      if (_event === "SIGNED_OUT") {
        void clearOutbox();
        void clearTodaySnapshot();
        void clearUpcomingSnapshot();
        void clearHistorySnapshot();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Restore the saved notification preference: ensure exactly one daily reminder
  // when still enabled+permitted, otherwise cancel it. Best-effort, never throws.
  useEffect(() => {
    void reconcileNotificationsOnStart();
  }, []);

  const base = scheme === "dark" ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: {
      ...base.colors,
      background: c.background,
      card: c.background,
      text: c.text,
      border: c.border,
      primary: c.accent,
    },
  };

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
      {loading ? (
        <View style={[styles.center, { backgroundColor: c.background }]}>
          <ActivityIndicator color={c.text} />
        </View>
      ) : session ? (
        <NavigationContainer theme={navTheme}>
          <Tab.Navigator
            screenOptions={{
              headerShown: false,
              tabBarActiveTintColor: c.text,
              tabBarInactiveTintColor: c.subtle,
              tabBarIconStyle: { display: "none" },
              tabBarLabelStyle: { fontSize: 13 },
              tabBarStyle: {
                backgroundColor: c.background,
                borderTopColor: c.border,
              },
            }}
          >
            <Tab.Screen name="Today" component={TodayScreen} />
            <Tab.Screen name="Upcoming" component={UpcomingScreen} />
            <Tab.Screen name="History" component={HistoryScreen} />
            <Tab.Screen name="Settings" component={SettingsScreen} />
          </Tab.Navigator>
        </NavigationContainer>
      ) : (
        <AuthScreen />
      )}
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
