import { isConnectivityError } from "@productivity/shared";

/**
 * Runs an async fn and NEVER rejects. Expected offline/connectivity failures are
 * logged calmly with console.warn(string) so Expo Go does not pop a red error
 * overlay; genuinely unexpected errors keep console.error for debugging.
 *
 * Returns the fn's result, or undefined if it failed.
 */
export async function safeAsync<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e) {
    if (isConnectivityError(e)) {
      console.warn(`Offline/network request failed during ${label}`);
    } else {
      console.error(`Unexpected error during ${label}`, e);
    }
    return undefined;
  }
}
