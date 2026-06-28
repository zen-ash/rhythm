import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { ThemeColors } from "@productivity/shared";
import { supabase } from "../lib/supabase";
import { useTheme } from "../lib/theme";

export default function AuthScreen() {
  const c = useTheme();
  const styles = useMemo(() => createStyles(c), [c]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleLogin() {
    setBusy(true);
    setError(null);
    setMessage(null);
    const { error: err } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (err) setError(err.message);
    setBusy(false);
  }

  async function handleSignup() {
    setBusy(true);
    setError(null);
    setMessage(null);
    const { error: err } = await supabase.auth.signUp({ email, password });
    if (err) {
      setError(err.message);
    } else {
      setMessage(
        "Account created. If email confirmation is on, confirm then log in.",
      );
    }
    setBusy(false);
  }

  return (
    <View style={styles.container}>
      <View style={styles.form}>
        <Text style={styles.heading}>Rhythm</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor={c.subtle}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          editable={!busy}
        />
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor={c.subtle}
          autoCapitalize="none"
          secureTextEntry
          editable={!busy}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {message ? <Text style={styles.note}>{message}</Text> : null}
        <Pressable
          style={[styles.button, styles.primary]}
          onPress={handleLogin}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color={c.background} />
          ) : (
            <Text style={styles.primaryLabel}>Log in</Text>
          )}
        </Pressable>
        <Pressable
          style={[styles.button, styles.secondary]}
          onPress={handleSignup}
          disabled={busy}
        >
          <Text style={styles.secondaryLabel}>Sign up</Text>
        </Pressable>
      </View>
    </View>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    },
    form: { width: "100%", maxWidth: 320, gap: 16 },
    heading: { fontSize: 22, fontWeight: "600", color: c.text },
    input: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 6,
      paddingHorizontal: 12,
      paddingVertical: 12,
      fontSize: 15,
      color: c.text,
    },
    button: {
      borderRadius: 6,
      paddingVertical: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    primary: { backgroundColor: c.accent },
    primaryLabel: { color: c.background, fontSize: 15 },
    secondary: {
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.background,
    },
    secondaryLabel: { color: c.text, fontSize: 15 },
    note: { fontSize: 13, color: c.mutedText },
    error: { fontSize: 13, color: c.danger },
  });
