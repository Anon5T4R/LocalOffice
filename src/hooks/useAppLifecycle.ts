import { useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { Editor } from "@tiptap/react";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import { openDocumentPath, type DocFile } from "../lib/document";
import { readRescue, clearRescue, registerRescueProvider } from "../lib/rescue";
import { contentForTab } from "../lib/tabHtml";
import { newTab, tabTitle, type Tab } from "../lib/tabs";
import type { DocLayout } from "../editor/DocLayout";
import type { SavableTab } from "./useDocumentTabs";
import { useTauriEvent } from "./useTauriEvent";

interface AppLifecycleDeps {
  editor: Editor | null;
  editorRef: RefObject<Editor | null>;
  tabsRef: RefObject<Tab[]>;
  activeIdRef: RefObject<string>;
  setTabs: Dispatch<SetStateAction<Tab[]>>;
  setActiveId: Dispatch<SetStateAction<string>>;
  openDocFile: (doc: DocFile) => void;
  queueSave: (tab: SavableTab, html: string, layout: DocLayout | null) => Promise<void>;
  cancelAutosave: () => void;
}

/**
 * App lifecycle wiring:
 * - window close intercepted by Rust → confirm unsaved tabs → exit_app;
 * - file passed at launch / forwarded by a second instance ("open with");
 * - crash rescue: registers the tab snapshot provider for the ErrorBoundary
 *   and offers to restore a snapshot left behind by a previous crash.
 */
export function useAppLifecycle({
  editor,
  editorRef,
  tabsRef,
  activeIdRef,
  setTabs,
  setActiveId,
  openDocFile,
  queueSave,
  cancelAutosave,
}: AppLifecycleDeps): void {
  // The Rust side intercepts the window close and emits "close-requested".
  // Every dirty tab that has somewhere to save gets saved outright first —
  // autosave would have written it moments later anyway, so there's no
  // reason to make the user confirm losing it. Only tabs that either have
  // nowhere to save to, or failed to save just now, need a confirmation.
  useTauriEvent("close-requested", async () => {
    cancelAutosave(); // a pending debounce write would otherwise race exit_app
    const dirty = tabsRef.current.filter((t) => t.dirty);
    const withPath = dirty.filter((t): t is Tab & { filePath: string } => !!t.filePath);
    const withoutPath = dirty.filter((t) => !t.filePath);

    const failed: string[] = [];
    await Promise.all(
      withPath.map(async (t) => {
        const { html, layout } = contentForTab(t, activeIdRef.current, editorRef.current);
        try {
          await queueSave({ id: t.id, filePath: t.filePath, format: t.format }, html, layout);
        } catch {
          failed.push(tabTitle(t));
        }
      })
    );

    if (withoutPath.length > 0 || failed.length > 0) {
      try {
        const parts: string[] = [];
        if (failed.length) parts.push(`${failed.length} documento(s) não puderam ser salvos automaticamente (${failed.join(", ")})`);
        if (withoutPath.length) parts.push(`${withoutPath.length} documento(s) nunca foram salvos em um arquivo`);
        const ok = await ask(`${parts.join("; ")}.\nSair mesmo assim?`, {
          title: "Sair do LocalOffice",
          kind: "warning",
        });
        if (!ok) return;
      } catch {
        /* if the dialog fails, fall through to exit so the user isn't trapped */
      }
    }
    invoke("exit_app").catch((e) => console.error("exit_app:", e));
  });

  // ---- Open a file passed at launch / forwarded by a 2nd instance ----
  const openedStartup = useRef(false);
  useEffect(() => {
    if (!editor || openedStartup.current) return;
    openedStartup.current = true;
    invoke<string | null>("get_startup_file")
      .then(async (p) => {
        if (p) {
          try {
            openDocFile(await openDocumentPath(p));
          } catch {}
        }
      })
      .catch(() => {});
  }, [editor, openDocFile]);

  useTauriEvent<string>("open-file", async (path) => {
    if (!path) return;
    try {
      openDocFile(await openDocumentPath(path));
    } catch {}
  });

  // Crash rescue: tell the ErrorBoundary how to snapshot the open tabs…
  useEffect(() => {
    return registerRescueProvider(() => {
      let activeDoc = null;
      try {
        activeDoc = editorRef.current?.getJSON() ?? null;
      } catch {
        activeDoc = null; // the crash reached the editor; fall back to the last swap
      }
      const activeId = activeIdRef.current;
      return {
        tabs: tabsRef.current.map((t) => ({
          filePath: t.filePath,
          format: t.format,
          doc: t.id === activeId && activeDoc ? activeDoc : t.doc,
        })),
        activeIndex: Math.max(0, tabsRef.current.findIndex((t) => t.id === activeId)),
        ts: Date.now(),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // …and offer to restore a snapshot left behind by a previous crash.
  const rescueChecked = useRef(false);
  useEffect(() => {
    if (!editor || rescueChecked.current) return;
    rescueChecked.current = true;
    readRescue()
      .then(async (snap) => {
        if (!snap || !snap.tabs.length) {
          if (snap) await clearRescue(); // empty snapshot, nothing to offer
          return;
        }
        const wantsRestore = window.confirm(
          "O LocalOffice fechou de forma inesperada com documentos abertos.\nRestaurar a sessão anterior?"
        );
        // The snapshot is only consumed once the user has answered — declining
        // (or the app dying while this dialog is up) must not destroy it.
        if (!wantsRestore) {
          await clearRescue();
          return;
        }
        // Restored tabs are dirty on purpose: the snapshot may be newer than disk.
        const restored = snap.tabs.map((t) =>
          newTab({ filePath: t.filePath, format: t.format, doc: t.doc, dirty: true })
        );
        const restoredPaths = new Set(restored.map((t) => t.filePath).filter((p): p is string => !!p));
        const keptActiveId = activeIdRef.current;
        let activeSurvives = false;
        setTabs((ts) => {
          const keep = ts.filter((t) => {
            // A tab already open on disk elsewhere in the snapshot loses to
            // the (possibly newer) restored copy of the same file.
            if (t.filePath && restoredPaths.has(t.filePath)) return false;
            // An untouched blank tab (e.g. the app's initial tab, or one a
            // startup file-open reused) is safe to drop — nothing to lose.
            if (!t.dirty && !t.filePath) return false;
            return true;
          });
          activeSurvives = keep.some((t) => t.id === keptActiveId);
          return [...keep, ...restored];
        });
        const idx = Math.min(Math.max(snap.activeIndex, 0), restored.length - 1);
        // If a file the user opened at launch (e.g. double-click) survived
        // the merge, keep it focused instead of jumping to the restored tab —
        // the user just asked for that document.
        if (!activeSurvives) {
          setActiveId(restored[idx].id);
          editor.commands.setContent(restored[idx].doc, { emitUpdate: false });
        }
        await clearRescue();
      })
      .catch(() => {});
  }, [editor, setTabs, setActiveId, activeIdRef]);
}
