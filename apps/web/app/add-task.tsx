"use client";

import type { CSSProperties } from "react";
import { useState } from "react";
import AddDate from "./add-date";
import SubmitButton from "./submit-button";

/**
 * Add-task form. Tracks the title input so the Add button stays muted while the
 * field is blank and brightens once there's a non-blank title — the button is
 * never the loudest thing on screen until it's actually actionable. The native
 * `required` attribute still blocks blank submits; clearing happens after the
 * server action resolves so the field resets like the old uncontrolled form.
 */
const styles: Record<string, CSSProperties> = {
  form: { display: "flex", gap: 8 },
  input: {
    flex: 1,
    padding: "10px 12px",
    fontSize: 15,
    border: "1px solid var(--border)",
    borderRadius: 6,
    outline: "none",
    color: "var(--text)",
    background: "var(--bg)",
  },
  button: {
    padding: "10px 14px",
    fontSize: 15,
    borderRadius: 6,
    cursor: "pointer",
    transition: "background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease",
  },
  buttonActive: {
    border: "1px solid var(--text)",
    background: "var(--text)",
    color: "var(--bg)",
  },
  buttonMuted: {
    border: "1px solid var(--border)",
    background: "var(--surface)",
    color: "var(--subtle)",
  },
};

export default function AddTask({
  action,
  today,
}: {
  action: (formData: FormData) => Promise<void>;
  today: string;
}) {
  const [title, setTitle] = useState("");
  const hasText = title.trim().length > 0;

  return (
    <form
      style={styles.form}
      action={async (formData) => {
        await action(formData);
        setTitle("");
      }}
    >
      <input
        className="field"
        style={styles.input}
        name="title"
        placeholder="Add a task"
        autoComplete="off"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
      />
      <AddDate defaultValue={today} />
      <SubmitButton
        className={hasText ? "btn-primary" : "btn-ghost"}
        style={{
          ...styles.button,
          ...(hasText ? styles.buttonActive : styles.buttonMuted),
        }}
      >
        Add
      </SubmitButton>
    </form>
  );
}
