import type { SaveStatus } from "./tabs";

/**
 * Save status keyed by tab id, outside React state. This used to live as one
 * `useState` in the App component: every autosave write set it three times
 * (saving → saved/error, plus the dirty-flag update), and each one re-rendered
 * the entire App tree (Ribbon, TabStrip, panels…) even though only StatusBar
 * ever displays it. `useSyncExternalStore` lets StatusBar subscribe directly
 * instead.
 */
const status = new Map<string, SaveStatus>();
const listeners = new Set<() => void>();
const IDLE: SaveStatus = { kind: "idle" };

export function setTabSaveStatus(tabId: string, next: SaveStatus): void {
  const prev = status.get(tabId);
  // Collapse repeated identical-shape transitions (e.g. "saving" set again
  // before the previous one resolved) — not a meaningful change to display.
  if (prev && prev.kind === next.kind && prev.kind !== "error" && prev.kind !== "saved") return;
  status.set(tabId, next);
  listeners.forEach((l) => l());
}

/** Drop a closed tab's status so it doesn't linger in the map forever. */
export function clearTabSaveStatus(tabId: string): void {
  if (status.delete(tabId)) listeners.forEach((l) => l());
}

export function getTabSaveStatus(tabId: string): SaveStatus {
  return status.get(tabId) ?? IDLE;
}

export function subscribeTabSaveStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
