import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { Editor } from "@tiptap/react";
import { saveDocumentTo } from "../lib/document";
import type { SaveStatus, Tab } from "../lib/tabs";
import type { SavableTab } from "./useDocumentTabs";

interface AutosaveDeps {
  editorRef: RefObject<Editor | null>;
  tabsRef: RefObject<Tab[]>;
  activeIdRef: RefObject<string>;
  setTabs: Dispatch<SetStateAction<Tab[]>>;
}

/**
 * Debounced autosave plus the serialized save pipeline.
 *
 * - Every disk write of a tab goes through one promise chain, so two writes
 *   to the same file can never interleave (autosave, switch-tab, manual save).
 * - A monotonic edit counter per tab ensures a finished save only clears
 *   `dirty` when no edit happened while the write was in flight.
 * - Failures keep the tab dirty, surface in `status` and retry with backoff.
 */
export function useAutosave({ editorRef, tabsRef, activeIdRef, setTabs }: AutosaveDeps) {
  const [status, setStatus] = useState<SaveStatus>({ kind: "idle" });

  const editSeq = useRef(new Map<string, number>());
  const saveChain = useRef<Promise<unknown>>(Promise.resolve());
  const autosaveTimer = useRef<number | null>(null);
  const firstDirtyAt = useRef(0);

  /** Record an edit on a tab (called from the editor's onUpdate). */
  const noteEdit = useCallback((tabId: string) => {
    editSeq.current.set(tabId, (editSeq.current.get(tabId) ?? 0) + 1);
  }, []);

  /** Drop per-tab bookkeeping when a tab closes. */
  const forgetTab = useCallback((tabId: string) => {
    editSeq.current.delete(tabId);
  }, []);

  const queueSave = useCallback(
    (tab: SavableTab, html: string): Promise<void> => {
      const seq = editSeq.current.get(tab.id) ?? 0;
      const job = saveChain.current.then(async () => {
        setStatus({ kind: "saving" });
        try {
          await saveDocumentTo(tab.filePath, html, tab.format);
        } catch (e) {
          setStatus({ kind: "error", message: String(e), at: Date.now() });
          throw e;
        }
        setStatus({ kind: "saved", at: Date.now() });
        if ((editSeq.current.get(tab.id) ?? 0) === seq) {
          setTabs((ts) => ts.map((t) => (t.id === tab.id ? { ...t, dirty: false } : t)));
        }
      });
      saveChain.current = job.catch(() => {}); // a failed save must not block the next one
      return job;
    },
    [setTabs]
  );

  const cancel = useCallback(() => {
    if (autosaveTimer.current) {
      clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }
    firstDirtyAt.current = 0;
  }, []);

  // Debounced: only writes when you pause typing (zero cost while typing),
  // and never loses more than a couple seconds of work.
  const doAutosaveRef = useRef<() => void>(() => {});
  const doAutosave = useCallback(() => {
    autosaveTimer.current = null;
    firstDirtyAt.current = 0;
    const editor = editorRef.current;
    if (!editor) return;
    const at = tabsRef.current.find((t) => t.id === activeIdRef.current);
    if (at && at.filePath && at.dirty) {
      queueSave({ id: at.id, filePath: at.filePath, format: at.format }, editor.getHTML()).catch(() => {
        // The tab stays dirty and the status bar shows the failure; retry with
        // backoff so a transient error (file lock, cloud sync) heals itself.
        if (!autosaveTimer.current) {
          autosaveTimer.current = window.setTimeout(() => doAutosaveRef.current(), 30_000);
        }
      });
    }
  }, [editorRef, tabsRef, activeIdRef, queueSave]);
  doAutosaveRef.current = doAutosave;

  const scheduleImpl = useCallback(() => {
    const at = tabsRef.current.find((t) => t.id === activeIdRef.current);
    if (!at || !at.filePath) return;
    const now = Date.now();
    if (firstDirtyAt.current === 0) firstDirtyAt.current = now;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    if (now - firstDirtyAt.current >= 60000) {
      doAutosave();
      return;
    }
    // pandoc-converted formats are heavier to write; give them a longer pause.
    const delay = at.format === "markdown" || at.format === "html" ? 2000 : 4000;
    autosaveTimer.current = window.setTimeout(doAutosave, delay);
  }, [tabsRef, activeIdRef, doAutosave]);

  // Stable identity so the editor's onUpdate (captured once at creation) can
  // call it directly; the ref always points at the latest closure.
  const scheduleImplRef = useRef(scheduleImpl);
  scheduleImplRef.current = scheduleImpl;
  const schedule = useCallback(() => scheduleImplRef.current(), []);

  useEffect(() => {
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, []);

  return { status, queueSave, schedule, cancel, noteEdit, forgetTab };
}
