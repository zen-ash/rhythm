"use client";

import type { ButtonHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";

/**
 * Submit button that disables itself while its form's Server Action is pending,
 * preventing rapid double-submits (duplicate tasks, double rollover, repeated
 * account deletion, etc.). Behavior is unchanged — only a transient disabled +
 * aria-busy state is added, which resets automatically when the action settles.
 */
export default function SubmitButton(
  props: ButtonHTMLAttributes<HTMLButtonElement>,
) {
  const { pending } = useFormStatus();
  const { children, disabled, ...rest } = props;
  return (
    <button
      type="submit"
      {...rest}
      disabled={pending || disabled}
      aria-busy={pending}
    >
      {children}
    </button>
  );
}
