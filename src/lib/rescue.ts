import { invoke } from "@tauri-apps/api/core";
import { appDataDir, join } from "@tauri-apps/api/path";
import type { JSONContent } from "@tiptap/core";
import type { DocFormat } from "./document";

/**
 * Crash rescue: when the ErrorBoundary catches a render error, it snapshots
 * every open tab to `appDataDir/rescue.json` (NOT localStorage — documents
 * with embedded data-URI images blow past the ~5MB quota) and the next mount
 * offers to restore. localStorage is only the fallback when the disk write
 * itself fails.
 */

export interface RescueSnapshot {
  tabs: { filePath: string | null; format: DocFormat; doc: JSONContent }[];
  activeIndex: number;
  ts: number;
}

const LS_KEY = "localoffice.rescue";

let provider: (() => RescueSnapshot) | null = null;

/** App registers how to snapshot its tabs; returns the unregister function. */
export function registerRescueProvider(fn: () => RescueSnapshot): () => void {
  provider = fn;
  return () => {
    if (provider === fn) provider = null;
  };
}

async function rescuePath(): Promise<string> {
  return join(await appDataDir(), "rescue.json");
}

/** Snapshot the open tabs to disk. Returns whether anything was persisted. */
export async function writeRescue(): Promise<boolean> {
  if (!provider) return false;
  let json: string;
  try {
    json = JSON.stringify(provider());
  } catch {
    return false; // the crash reached the document itself; nothing to save
  }
  try {
    await invoke("write_text_file", { path: await rescuePath(), contents: json });
    return true;
  } catch {
    try {
      localStorage.setItem(LS_KEY, json);
      return true;
    } catch {
      return false; // quota exceeded — bad luck on both fronts
    }
  }
}

/** Read a pending rescue snapshot and clear it so it's offered only once. */
export async function readAndClearRescue(): Promise<RescueSnapshot | null> {
  try {
    const fromLs = localStorage.getItem(LS_KEY);
    if (fromLs) {
      localStorage.removeItem(LS_KEY);
      return JSON.parse(fromLs) as RescueSnapshot;
    }
    const path = await rescuePath();
    const raw = await invoke<string>("read_text_file", { path });
    const snap = JSON.parse(raw) as RescueSnapshot | null;
    if (snap) {
      // "null" marks the snapshot as consumed (there is no delete command,
      // and an empty file would just be a parse error on the next read).
      await invoke("write_text_file", { path, contents: "null" });
    }
    return snap && Array.isArray(snap.tabs) ? snap : null;
  } catch {
    return null; // no rescue file — the normal case
  }
}
