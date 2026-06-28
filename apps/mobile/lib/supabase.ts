import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";
import { createMobileSupabaseClient } from "@productivity/supabase";
import { safeAsync } from "./safeAsync";

// EXPO_PUBLIC_* values are read HERE (in app code) so Expo's bundler inlines
// them, then passed explicitly into the factory — the package never reads them.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey) {
  throw new Error(
    "Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env.local and fill it in.",
  );
}

export const supabase = createMobileSupabaseClient(url, publishableKey, {
  storage: AsyncStorage,
});

// Keep tokens fresh only while the app is foregrounded (Supabase RN guidance).
AppState.addEventListener("change", (state) => {
  // Wrapped so an offline auto-refresh attempt can't surface as an uncaught
  // "Network request failed" overlay when the app returns to the foreground.
  if (state === "active") {
    void safeAsync("auto-refresh start", () => supabase.auth.startAutoRefresh());
  } else {
    void safeAsync("auto-refresh stop", () => supabase.auth.stopAutoRefresh());
  }
});
