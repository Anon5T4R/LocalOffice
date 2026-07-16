import { useCallback, useRef, useState, type RefObject } from "react";
import type { Editor } from "@tiptap/react";
import type { DocFile, DocFormat } from "../lib/document";
import type { DocLayout } from "../editor/DocLayout";
import { Tab, EMPTY_DOC, newTab, tabTitle } from "../lib/tabs";
import { useLatest } from "./useLatest";
import { t as tr } from "../lib/i18n";

/** The slice of a tab that a disk write needs (filePath guaranteed present). */
export interface SavableTab {
  id: string;
  filePath: string;
  format: DocFormat;
}

export interface DocumentTabsOptions {
  /** A dirty tab with a file on disk is losing focus; persist it. */
  onLeaveDirtyTab?: (tab: SavableTab, html: string, layout: DocLayout | null) => void;
  /** A tab was closed — drop any per-tab bookkeeping keyed by its id. */
  onCloseTab?: (id: string) => void;
  /** A document landed in a tab (recents bookkeeping). */
  onOpened?: (path: string) => void;
}

/** The outgoing tab's layout, straight from the live editor (source of truth
 *  for whichever tab is currently active). */
function currentLayout(editor: Editor): DocLayout | null {
  return (editor.state.doc.attrs.layout as DocLayout | null) ?? null;
}

/** Apply a layout to the doc without an undo step — used right after opening
 *  a file, since the loaded layout is the document's starting state, not a
 *  user edit the way an in-app layout change is. */
function seedLayout(editor: Editor, layout: DocLayout | null): void {
  if (!layout) return;
  editor.view.dispatch(editor.state.tr.setDocAttribute("layout", layout).setMeta("addToHistory", false));
}

/**
 * Document tabs over a single shared TipTap editor: the active tab lives in
 * the editor, inactive tabs keep their ProseMirror JSON in `doc`, and
 * switching swaps content. Callbacks read the editor through `editorRef` so
 * they always see the live instance without depending on creation order.
 */
export function useDocumentTabs(editorRef: RefObject<Editor | null>, opts: DocumentTabsOptions = {}) {
  const first = useRef<Tab>(newTab());
  const [tabs, setTabs] = useState<Tab[]>(() => [first.current]);
  const [activeId, setActiveId] = useState<string>(first.current.id);

  // Refs so timers / editor callbacks always see fresh state.
  const tabsRef = useLatest(tabs);
  const activeIdRef = useLatest(activeId);

  // Latest-ref for the callbacks: they may close over values created after
  // this hook runs (e.g. the autosave queue), so they're re-read per call.
  const optsRef = useLatest(opts);

  const markTabDirty = useCallback((id: string) => {
    setTabs((ts) => ts.map((t) => (t.id === id && !t.dirty ? { ...t, dirty: true } : t)));
  }, []);

  const switchTab = useCallback((id: string) => {
    const editor = editorRef.current;
    if (!editor || id === activeIdRef.current) return;
    const oldId = activeIdRef.current;
    const json = editor.getJSON();
    const target = tabsRef.current.find((t) => t.id === id);
    if (!target) return;
    // Persist the outgoing tab on its way out — switching must never leave
    // unsaved work behind. The callback decides how (autosave queue).
    const old = tabsRef.current.find((t) => t.id === oldId);
    if (old?.dirty && old.filePath) {
      optsRef.current.onLeaveDirtyTab?.(
        { id: old.id, filePath: old.filePath, format: old.format },
        editor.getHTML(),
        currentLayout(editor)
      );
    }
    setTabs((ts) => ts.map((t) => (t.id === oldId ? { ...t, doc: json } : t)));
    editor.commands.setContent(target.doc, { emitUpdate: false });
    setActiveId(id);
  }, [editorRef]);

  const newBlankTab = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const oldId = activeIdRef.current;
    const old = tabsRef.current.find((t) => t.id === oldId);
    // Persist the outgoing tab, same as switchTab — a blank new tab must
    // never leave unsaved work behind on the one it replaced as active.
    if (old?.dirty && old.filePath) {
      optsRef.current.onLeaveDirtyTab?.(
        { id: old.id, filePath: old.filePath, format: old.format },
        editor.getHTML(),
        currentLayout(editor)
      );
    }
    const json = editor.getJSON();
    const t = newTab();
    setTabs((ts) => ts.map((x) => (x.id === oldId ? { ...x, doc: json } : x)).concat(t));
    editor.commands.setContent(EMPTY_DOC, { emitUpdate: false });
    setActiveId(t.id);
  }, [editorRef]);

  const openDocFile = useCallback((doc: DocFile) => {
    const editor = editorRef.current;
    if (!editor) return;
    const oldId = activeIdRef.current;
    const active = tabsRef.current.find((t) => t.id === oldId);
    const reuse = !!active && !active.filePath && !active.dirty;

    if (reuse) {
      editor.commands.setContent(doc.html, { emitUpdate: false });
      seedLayout(editor, doc.layout);
      const json = editor.getJSON();
      setTabs((ts) =>
        ts.map((t) => (t.id === oldId ? { ...t, filePath: doc.path, format: doc.format, doc: json, dirty: false } : t))
      );
    } else {
      // Persist the outgoing tab before its content is overwritten below —
      // opening a file must never silently drop the previously active tab.
      if (active?.dirty && active.filePath) {
        optsRef.current.onLeaveDirtyTab?.(
          { id: active.id, filePath: active.filePath, format: active.format },
          editor.getHTML(),
          currentLayout(editor)
        );
      }
      const oldJson = editor.getJSON();
      editor.commands.setContent(doc.html, { emitUpdate: false });
      seedLayout(editor, doc.layout);
      const newJson = editor.getJSON();
      const t = newTab({ filePath: doc.path, format: doc.format, doc: newJson, dirty: false });
      setTabs((ts) => ts.map((x) => (x.id === oldId ? { ...x, doc: oldJson } : x)).concat(t));
      setActiveId(t.id);
    }
    optsRef.current.onOpened?.(doc.path);
  }, [editorRef]);

  const closeTab = useCallback((id: string) => {
    const editor = editorRef.current;
    const t = tabsRef.current.find((x) => x.id === id);
    if (!t || !editor) return;
    if (t.dirty && !window.confirm(tr("tabs.closeConfirm", { title: tabTitle(t) }))) return;

    optsRef.current.onCloseTab?.(id);
    const idx = tabsRef.current.findIndex((x) => x.id === id);
    const remaining = tabsRef.current.filter((x) => x.id !== id);

    if (remaining.length === 0) {
      const nt = newTab();
      editor.commands.setContent(EMPTY_DOC, { emitUpdate: false });
      setTabs([nt]);
      setActiveId(nt.id);
      return;
    }
    if (id === activeIdRef.current) {
      const neighbor = remaining[Math.min(idx, remaining.length - 1)];
      editor.commands.setContent(neighbor.doc, { emitUpdate: false });
      setActiveId(neighbor.id);
    }
    setTabs(remaining);
  }, [editorRef]);

  return {
    tabs,
    setTabs,
    activeId,
    setActiveId,
    activeTab: tabs.find((t) => t.id === activeId),
    tabsRef,
    activeIdRef,
    markTabDirty,
    switchTab,
    newBlankTab,
    openDocFile,
    closeTab,
  };
}
