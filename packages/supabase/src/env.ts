/**
 * Minimal public-env helpers for the typed Supabase clients.
 *
 * These only validate values the caller passes in (so bundlers can still
 * statically inline the literal `process.env.X` reference) and fail loudly when
 * a required public var is missing. No secrets are stored here, and only
 * public (publishable) values ever flow through.
 */

export class MissingEnvError extends Error {
  constructor(name: string) {
    super(`Missing required environment variable: ${name}`);
    this.name = "MissingEnvError";
  }
}

/** Returns the value or throws MissingEnvError if it is undefined/blank. */
export function requireEnv(name: string, value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    throw new MissingEnvError(name);
  }
  return value;
}
