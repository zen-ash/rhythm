import { Component, type ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { getTheme, type ThemeColors } from "@productivity/shared";

/**
 * Calm, themed fallback shown if a render error escapes a screen, so a crash
 * never leaves the user on a blank screen. Functional so it can read the OS
 * color scheme (the boundary itself is a class component).
 */
function Fallback({ onReset }: { onReset: () => void }) {
  const c = getTheme(useColorScheme());
  const styles = createStyles(c);
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Something went wrong. Please reload.</Text>
      <Pressable style={styles.button} hitSlop={8} onPress={onReset}>
        <Text style={styles.buttonText}>Reload</Text>
      </Pressable>
    </View>
  );
}

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown): void {
    // Calm log only (no external crash reporting).
    console.warn("ErrorBoundary caught a render error", error);
  }

  reset = (): void => this.setState({ hasError: false });

  render(): ReactNode {
    if (this.state.hasError) {
      return <Fallback onReset={this.reset} />;
    }
    return this.props.children;
  }
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
      alignItems: "center",
      justifyContent: "center",
      padding: 32,
      gap: 16,
    },
    text: { fontSize: 15, color: c.text, textAlign: "center" },
    button: {
      minHeight: 44,
      justifyContent: "center",
      paddingHorizontal: 18,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 8,
    },
    buttonText: { fontSize: 15, color: c.text },
  });
