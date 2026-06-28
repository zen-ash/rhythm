"use client";

import type { CSSProperties } from "react";
import { deleteAccount } from "./actions";
import SubmitButton from "../submit-button";

const styles: Record<string, CSSProperties> = {
  button: {
    border: "1px solid var(--danger)",
    background: "none",
    color: "var(--danger)",
    fontSize: 14,
    padding: "8px 12px",
    borderRadius: 6,
    cursor: "pointer",
    alignSelf: "flex-start",
  },
};

export default function DeleteAccountButton() {
  return (
    <form action={deleteAccount}>
      <SubmitButton
        className="btn-danger"
        style={styles.button}
        onClick={(e) => {
          if (
            !window.confirm(
              "Delete your account? This permanently deletes your data and cannot be undone.",
            )
          ) {
            e.preventDefault();
          }
        }}
      >
        Delete Account
      </SubmitButton>
    </form>
  );
}
