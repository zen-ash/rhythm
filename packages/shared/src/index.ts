/**
 * @productivity/shared
 *
 * Framework-agnostic shared layer for the Productivity app. This package must
 * stay free of React, Next.js, and Expo imports so that both `apps/web` and
 * `apps/mobile` can consume it as source.
 *
 * Phase 0: this only exposes a sanity constant + helper used to prove that both
 * apps can import from the shared package. Domain types, zod schemas, timer
 * math, and rollover logic arrive in later phases.
 */

export * from "./id";
export * from "./status";
export * from "./date";
export * from "./task";
export * from "./timer";
export * from "./summary";
export * from "./outbox";
export * from "./recurrence";
export * from "./theme";

export const APP_NAME = "Rhythm" as const;

export const SHARED_PACKAGE_GREETING =
  `Hello from @productivity/shared — ${APP_NAME}` as const;

/** Phase 0 sanity helper; lets each app render a value sourced from shared. */
export function getSharedGreeting(): string {
  return SHARED_PACKAGE_GREETING;
}
