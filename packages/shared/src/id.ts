/**
 * React Native-safe UUID v4 generator. Prefers crypto.randomUUID (web, modern
 * Hermes) and falls back to a Math.random-based v4 when it is unavailable.
 *
 * ALWAYS returns a valid RFC 4122 v4 UUID string, so it is safe to use for
 * Postgres `uuid` columns (e.g. tasks.id) on client-generated inserts.
 */
export function createUuid(): string {
  const cryptoObj = (
    globalThis as { crypto?: { randomUUID?: () => string } }
  ).crypto;
  if (cryptoObj?.randomUUID) {
    return cryptoObj.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
