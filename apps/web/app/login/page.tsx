import type { CSSProperties } from "react";
import { login, signup } from "./actions";
import SubmitButton from "../submit-button";

const styles: Record<string, CSSProperties> = {
  main: {
    minHeight: "100dvh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    fontFamily: "system-ui, sans-serif",
    color: "var(--text)",
    background: "var(--canvas)",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    width: "100%",
    maxWidth: 360,
  },
  heading: { margin: 0, fontSize: 20, fontWeight: 600 },
  input: {
    padding: "10px 12px",
    fontSize: 15,
    border: "1px solid var(--border)",
    borderRadius: 6,
    outline: "none",
    background: "var(--bg)",
    color: "var(--text)",
  },
  primary: {
    padding: "10px 12px",
    fontSize: 15,
    border: "1px solid var(--text)",
    borderRadius: 6,
    background: "var(--text)",
    color: "var(--bg)",
    cursor: "pointer",
  },
  secondary: {
    padding: "10px 12px",
    fontSize: 15,
    border: "1px solid var(--border)",
    borderRadius: 6,
    background: "var(--bg)",
    color: "var(--text)",
    cursor: "pointer",
  },
  note: { margin: 0, fontSize: 13, color: "var(--muted)" },
};

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const params = await searchParams;

  return (
    <main style={styles.main}>
      <form className="workspace-sm" style={styles.form}>
        <h1 style={styles.heading}>Rhythm</h1>
        <input
          className="field"
          style={styles.input}
          name="email"
          type="email"
          placeholder="Email"
          autoComplete="email"
          required
        />
        <input
          className="field"
          style={styles.input}
          name="password"
          type="password"
          placeholder="Password"
          autoComplete="current-password"
          required
        />
        {params.error ? <p style={styles.note}>{params.error}</p> : null}
        {params.message ? <p style={styles.note}>{params.message}</p> : null}
        <SubmitButton
          className="btn-primary"
          style={styles.primary}
          formAction={login}
        >
          Log in
        </SubmitButton>
        <SubmitButton
          className="btn-outline"
          style={styles.secondary}
          formAction={signup}
        >
          Sign up
        </SubmitButton>
      </form>
    </main>
  );
}
