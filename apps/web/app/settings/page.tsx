import type { CSSProperties } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "../login/actions";
import DeleteAccountButton from "./delete-account-button";
import ThemeControl from "./theme-control";
import MainNav from "../main-nav";
import SubmitButton from "../submit-button";

const styles: Record<string, CSSProperties> = {
  main: {
    minHeight: "100dvh",
    display: "flex",
    justifyContent: "center",
    padding: "48px 24px",
    fontFamily: "system-ui, sans-serif",
    color: "var(--text)",
    background: "var(--canvas)",
  },
  column: {
    width: "100%",
    maxWidth: 600,
    display: "flex",
    flexDirection: "column",
    gap: 28,
  },
  title: { margin: 0, fontSize: 22, fontWeight: 600 },
  field: { display: "flex", flexDirection: "column", gap: 4 },
  label: {
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: "var(--subtle)",
  },
  value: { fontSize: 15, color: "var(--text)" },
  signout: {
    border: "1px solid var(--border)",
    background: "none",
    color: "var(--text)",
    fontSize: 14,
    padding: "8px 12px",
    borderRadius: 6,
    cursor: "pointer",
    alignSelf: "flex-start",
  },
  error: { color: "var(--danger)", fontSize: 13, margin: 0 },
};

export const metadata = { title: "Settings" };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <main style={styles.main}>
      <div className="workspace" style={styles.column}>
        <h1 style={styles.title}>Settings</h1>

        <MainNav />

        <div style={styles.field}>
          <span style={styles.label}>Email</span>
          <span style={styles.value}>{user.email}</span>
        </div>

        <ThemeControl />

        <form action={signOut}>
          <SubmitButton className="btn-outline" style={styles.signout}>
            Sign out
          </SubmitButton>
        </form>

        {error ? <p style={styles.error}>{error}</p> : null}

        <DeleteAccountButton />
      </div>
    </main>
  );
}
