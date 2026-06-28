"use client";

import type { CSSProperties } from "react";
import { useState } from "react";
import { toRecurrenceOption } from "@productivity/shared";
import type { Tables } from "@productivity/supabase";
import {
  deleteTask,
  moveOverdueTask,
  startTimerAction,
  toggleTaskStatus,
  updateTask,
} from "./actions";
import SubmitButton from "./submit-button";

type Task = Tables<"tasks">;

const styles: Record<string, CSSProperties> = {
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    paddingTop: 12,
    paddingBottom: 12,
    paddingLeft: 0,
    paddingRight: 0,
    borderBottom: "1px solid var(--border)",
  },
  rowActive: {
    background: "var(--surface)",
    borderLeft: "2px solid var(--accent)",
    paddingLeft: 8,
    borderRadius: 4,
  },
  toggle: {
    width: 20,
    height: 20,
    lineHeight: "18px",
    textAlign: "center",
    border: "none",
    background: "none",
    padding: 0,
    fontSize: 16,
    color: "var(--text)",
    cursor: "pointer",
  },
  titleButton: {
    flex: 1,
    minWidth: 0,
    overflowWrap: "anywhere",
    textAlign: "left",
    border: "none",
    background: "none",
    padding: 0,
    fontSize: 15,
    color: "var(--text)",
    cursor: "text",
  },
  titleDone: {
    flex: 1,
    minWidth: 0,
    overflowWrap: "anywhere",
    textAlign: "left",
    border: "none",
    background: "none",
    padding: 0,
    fontSize: 15,
    color: "var(--subtle)",
    textDecoration: "line-through",
    cursor: "text",
  },
  textButton: {
    border: "none",
    background: "none",
    color: "var(--subtle)",
    fontSize: 13,
    cursor: "pointer",
    padding: 0,
  },
  startButton: {
    border: "none",
    background: "none",
    color: "var(--muted)",
    fontSize: 13,
    cursor: "pointer",
    padding: 0,
  },
  remove: {
    border: "none",
    background: "none",
    color: "var(--subtle)",
    fontSize: 16,
    cursor: "pointer",
    padding: 0,
  },
  editForm: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: 14,
    margin: "6px 0",
  },
  input: {
    padding: "8px 10px",
    fontSize: 15,
    border: "1px solid var(--border)",
    borderRadius: 6,
    outline: "none",
    color: "var(--text)",
    background: "var(--bg)",
  },
  textarea: {
    padding: "8px 10px",
    fontSize: 14,
    border: "1px solid var(--border)",
    borderRadius: 6,
    outline: "none",
    color: "var(--text)",
    background: "var(--bg)",
    resize: "vertical",
    minHeight: 48,
    fontFamily: "inherit",
  },
  editActions: { display: "flex", gap: 12, alignItems: "center" },
  save: {
    border: "1px solid var(--text)",
    borderRadius: 6,
    background: "var(--text)",
    color: "var(--bg)",
    fontSize: 14,
    padding: "6px 12px",
    cursor: "pointer",
  },
  cancel: {
    border: "none",
    background: "none",
    color: "var(--subtle)",
    fontSize: 14,
    cursor: "pointer",
    padding: 0,
  },
  dateInput: {
    padding: "8px 10px",
    fontSize: 15,
    border: "1px solid var(--border)",
    borderRadius: 6,
    outline: "none",
    color: "var(--text)",
    background: "var(--bg)",
    width: "fit-content",
  },
  select: {
    padding: "8px 10px",
    fontSize: 14,
    border: "1px solid var(--border)",
    borderRadius: 6,
    outline: "none",
    color: "var(--text)",
    background: "var(--bg)",
    width: "fit-content",
  },
};

export default function TaskItem({
  task,
  canStart,
  isOverdue,
  isActive = false,
}: {
  task: Task;
  canStart: boolean;
  isOverdue: boolean;
  isActive?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const done = task.status === "completed";

  if (editing) {
    return (
      <form
        className="edit-panel"
        style={styles.editForm}
        action={async (formData) => {
          await updateTask(formData);
          setEditing(false);
        }}
      >
        <input type="hidden" name="id" value={task.id} />
        <input
          className="field"
          style={styles.input}
          name="title"
          defaultValue={task.title}
          placeholder="Title"
          autoComplete="off"
          required
        />
        <textarea
          className="field"
          style={styles.textarea}
          name="description"
          defaultValue={task.description ?? ""}
          placeholder="Notes (optional)"
        />
        <input
          className="field"
          style={styles.dateInput}
          name="scheduled_date"
          type="date"
          defaultValue={task.scheduled_date}
        />
        <select
          className="field"
          style={styles.select}
          name="recurrence_rule"
          defaultValue={toRecurrenceOption(task.recurrence_rule)}
          aria-label="Repeat"
        >
          <option value="none">Repeat: None</option>
          <option value="daily">Repeat: Daily</option>
          <option value="weekly">Repeat: Weekly</option>
        </select>
        <div style={styles.editActions}>
          <SubmitButton className="btn-primary" style={styles.save}>
            Save
          </SubmitButton>
          <button
            className="btn-ghost"
            style={styles.cancel}
            type="button"
            onClick={() => setEditing(false)}
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div
      className="task-row"
      style={isActive ? { ...styles.row, ...styles.rowActive } : styles.row}
    >
      <form action={toggleTaskStatus}>
        <input type="hidden" name="id" value={task.id} />
        <input type="hidden" name="status" value={task.status} />
        <SubmitButton
          className="btn-ghost"
          style={styles.toggle}
          aria-label="Toggle complete"
        >
          {done ? "●" : "○"}
        </SubmitButton>
      </form>
      <button
        className="btn-ghost"
        style={done ? styles.titleDone : styles.titleButton}
        type="button"
        onClick={() => setEditing(true)}
      >
        {task.title}
      </button>
      {isOverdue ? (
        <>
          <form action={moveOverdueTask}>
            <input type="hidden" name="id" value={task.id} />
            <input type="hidden" name="target" value="today" />
            <SubmitButton className="btn-ghost" style={styles.textButton}>
              Today
            </SubmitButton>
          </form>
          <form action={moveOverdueTask}>
            <input type="hidden" name="id" value={task.id} />
            <input type="hidden" name="target" value="tomorrow" />
            <SubmitButton className="btn-ghost" style={styles.textButton}>
              Tomorrow
            </SubmitButton>
          </form>
        </>
      ) : canStart && !done ? (
        <form action={startTimerAction}>
          <input type="hidden" name="task_id" value={task.id} />
          <SubmitButton className="btn-ghost" style={styles.startButton}>
            Start
          </SubmitButton>
        </form>
      ) : null}
      <form action={deleteTask}>
        <input type="hidden" name="id" value={task.id} />
        <SubmitButton
          className="btn-ghost"
          style={styles.remove}
          aria-label="Delete task"
        >
          {"×"}
        </SubmitButton>
      </form>
    </div>
  );
}
