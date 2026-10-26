/**
 * Background auto-testing settings (client-only, localStorage-backed).
 *
 * When enabled and the tab stays open, the Live Test page measures the
 * network on its own every N minutes and saves each run — no clicks needed.
 */

const AUTO_RUN_KEY = "wifi-analyzer-autorun";
const AUTO_RUN_INTERVAL_KEY = "wifi-analyzer-autorun-mins";

/** Offered auto-test intervals in minutes. */
export const AUTO_RUN_INTERVALS = [15, 30, 60] as const;

export const DEFAULT_AUTO_RUN_MINUTES = 30;

/** Whether background auto-testing is switched on for this device. */
export function getAutoRunEnabled(): boolean {
  try {
    return localStorage.getItem(AUTO_RUN_KEY) === "1";
  } catch {
    return false;
  }
}

/** Switch background auto-testing on/off for this device. */
export function setAutoRunEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(AUTO_RUN_KEY, enabled ? "1" : "0");
  } catch {
    // Local storage blocked — the setting just won't persist.
  }
}

/** The configured auto-test interval in minutes (default 30). */
export function getAutoRunInterval(): number {
  try {
    const value = Number(localStorage.getItem(AUTO_RUN_INTERVAL_KEY));
    return (AUTO_RUN_INTERVALS as readonly number[]).includes(value) ? value : DEFAULT_AUTO_RUN_MINUTES;
  } catch {
    return DEFAULT_AUTO_RUN_MINUTES;
  }
}

/** Remember the chosen auto-test interval on this device. */
export function setAutoRunInterval(minutes: number): void {
  try {
    localStorage.setItem(AUTO_RUN_INTERVAL_KEY, String(minutes));
  } catch {
    // Local storage blocked — the setting just won't persist.
  }
}

/** "12:34" style countdown for the next automatic run. */
export function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
