import { useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { Editor } from "@tiptap/react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ask } from "@tauri-apps/plugin-dialog";
import { openDocumentPath, type DocFile } from "../lib/document";
import { readAndClearRescue, registerRescueProvider } from "../lib/rescue";
import { newTab, type Tab } from "../lib/tabs";

interface AppLifecycleDeps {
  editor: Editor | null;
  editorRef: RefObject<Editor | null>;
  tabsRef: RefObject<Tab[]>;
  activeIdRef: RefObject<string>;
  setTabs: Dispatch<SetStateAction<Tab[]>>;
  setActiveId: Dispatch<SetStateAction<string>>;
  openDocFile: (doc: DocFile) => void;
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
}: AppLifecycleDeps): void {
  // The Rust side intercepts the window close and emits "close-requested".
  // We confirm here (we know which tabs are unsaved) and then quit via exit_app.
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | null = null;

    listen("close-requested", async () => {
      try {
        const dirtyCount = tabsRef.current.filter((t) => t.dirty).length;
        if (dirtyCount > 0) {
          const ok = await ask(
            `Você tem ${dirtyCount} documento(s) com alterações não salvas.\nSair mesmo assim?`,
            { title: "Sair do LocalOffice", kind: "warning" }
          );
          if (!ok) return;
        }
      } catch {
        /* if the dialog fails, fall through to exit so the user isn't trapped */
      }
      invoke("exit_app").catch((e) => console.error("exit_app:", e));
    }).then((un) => {
      if (cancelled) { un(); return; }
      unlisten = un;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

    let cancelled = false;
    let unlisten: (() => void) | null = null;
    listen<string>("open-file", async (e) => {
      if (e.payload) {
        try {
          openDocFile(await openDocumentPath(e.payload));
        } catch {}
      }
    }).then((un) => {
      if (cancelled) { un(); return; }
      unlisten = un;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [editor, openDocFile]);

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
    readAndClearRescue()
      .then((snap) => {
        if (!snap || !snap.tabs.length) return;
        if (!window.confirm("O LocalOffice fechou de forma inesperada com documentos abertos.\nRestaurar a sessão anterior?")) return;
        // Restored tabs are dirty on purpose: the snapshot may be newer than disk.
        const restored = snap.tabs.map((t) =>
          newTab({ filePath: t.filePath, format: t.format, doc: t.doc, dirty: true })
        );
        const idx = Math.min(Math.max(snap.activeIndex, 0), restored.length - 1);
        setTabs(restored);
        setActiveId(restored[idx].id);
        editor.commands.setContent(restored[idx].doc, { emitUpdate: false });
      })
      .catch(() => {});
  }, [editor, setTabs, setActiveId]);
}
