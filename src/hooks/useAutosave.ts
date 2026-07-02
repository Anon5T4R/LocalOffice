import { useCallback, useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { Editor } from "@tiptap/react";
import { saveDocumentTo } from "../lib/document";
import { contentForTab } from "../lib/tabHtml";
import { setTabSaveStatus, clearTabSaveStatus } from "../lib/saveStatusStore";
import type { DocLayout } from "../editor/DocLayout";
import type { Tab } from "../lib/tabs";
import type { SavableTab } from "./useDocumentTabs";
import { useLatest } from "./useLatest";

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
 * - Failures keep the tab dirty, surface in the per-tab save-status store
 *   (see lib/saveStatusStore.ts) and retry with backoff.
 */
export function useAutosave({ editorRef, tabsRef, activeIdRef, setTabs }: AutosaveDeps) {
  const editSeq = useRef(new Map<string, number>());
  const saveChain = useRef<Promise<unknown>>(Promise.resolve());
  const autosaveTimer = useRef<number | null>(null);
  const firstDirtyAt = useRef(0);
  // One backoff timer per tab id, so a failed save retries that specific
  // tab — a single shared timer would fire against whatever tab happened to
  // be active 30s later, silently doing nothing (and never rescheduling) if
  // that wasn't the tab that actually failed.
  const retryTimers = useRef(new Map<string, number>());

  /** Record an edit on a tab (called from the editor's onUpdate). */
  const noteEdit = useCallback((tabId: string) => {
    editSeq.current.set(tabId, (editSeq.current.get(tabId) ?? 0) + 1);
  }, []);

  /** Drop per-tab bookkeeping when a tab closes. */
  const forgetTab = useCallback((tabId: string) => {
    editSeq.current.delete(tabId);
    clearTabSaveStatus(tabId);
    const timer = retryTimers.current.get(tabId);
    if (timer) {
      clearTimeout(timer);
      retryTimers.current.delete(tabId);
    }
  }, []);

  const queueSave = useCallback(
    (tab: SavableTab, html: string, layout: DocLayout | null): Promise<void> => {
      const seq = editSeq.current.get(tab.id) ?? 0;
      const job = saveChain.current.then(async () => {
        setTabSaveStatus(tab.id, { kind: "saving" });
        try {
          await saveDocumentTo(tab.filePath, html, tab.format, layout);
        } catch (e) {
          setTabSaveStatus(tab.id, { kind: "error", message: String(e), at: Date.now() });
          throw e;
        }
        setTabSaveStatus(tab.id, { kind: "saved", at: Date.now() });
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

  // Save one tab by id — using its live editor content if it's still the
  // active tab, or its stored ProseMirror JSON otherwise (a background tab
  // can be the retry target after the user switched away). On failure,
  // reschedule a backoff retry keyed to that same tab id. A ref (not
  // useCallback) because the body calls itself recursively on retry.
  const saveTabByIdRef = useLatest((tabId: string) => {
    const tab = tabsRef.current.find((t) => t.id === tabId);
    if (!tab || !tab.filePath || !tab.dirty) return; // healed or closed meanwhile
    const { html, layout } = contentForTab(tab, activeIdRef.current, editorRef.current);
    queueSave({ id: tab.id, filePath: tab.filePath, format: tab.format }, html, layout).catch(() => {
      // The tab stays dirty and the status bar shows the failure; retry with
      // backoff so a transient error (file lock, cloud sync) heals itself.
      if (retryTimers.current.has(tabId)) return;
      retryTimers.current.set(
        tabId,
        window.setTimeout(() => {
          retryTimers.current.delete(tabId);
          saveTabByIdRef.current(tabId);
        }, 30_000)
      );
    });
  });

  // Debounced: only writes when you pause typing (zero cost while typing),
  // and never loses more than a couple seconds of work.
  const doAutosave = useCallback(() => {
    autosaveTimer.current = null;
    firstDirtyAt.current = 0;
    const at = tabsRef.current.find((t) => t.id === activeIdRef.current);
    if (at) saveTabByIdRef.current(at.id);
  }, [tabsRef, activeIdRef]);

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
  const scheduleImplRef = useLatest(scheduleImpl);
  const schedule = useCallback(() => scheduleImplRef.current(), []);

  useEffect(() => {
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      retryTimers.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  return { queueSave, schedule, cancel, noteEdit, forgetTab };
}
