import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { invoke } from "@tauri-apps/api/core";
import { buildExtensions } from "./editor/extensions";
import { MenuBar } from "./editor/MenuBar";
import { Ribbon } from "./editor/ribbon/Ribbon";
import { TabStrip } from "./editor/TabStrip";
import { SearchBar } from "./editor/search/SearchBar";
import { ChaptersPanel } from "./editor/ChaptersPanel";
import { ReviewPanel } from "./editor/ReviewPanel";
import { StatusBar } from "./editor/StatusBar";
import { AiPanel } from "./ai/AiPanel";
import { AiBubbleMenu } from "./ai/AiBubbleMenu";
import { useLocalAi } from "./ai/useLocalAi";
import { SettingsModal } from "./SettingsModal";
import { VersionHistory } from "./VersionHistory";
import { PrintPreview } from "./PrintPreview";
import { DocTemplate, applyTemplateContent } from "./lib/templates";
import { EMPTY_DOC } from "./lib/tabs";
import { useDocumentTabs } from "./hooks/useDocumentTabs";
import { useAutosave } from "./hooks/useAutosave";
import { useFileOperations } from "./hooks/useFileOperations";
import { useZoom } from "./hooks/useZoom";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useCitationRegistry } from "./hooks/useCitationRegistry";

import { useAppLifecycle } from "./hooks/useAppLifecycle";
import { useSettings } from "./state/SettingsContext";
import { EditorProvider } from "./state/EditorContext";
import { PAGE_SIZES } from "./lib/pageGeometry";
import { effectiveLayoutFor, patchDocLayout, type DocLayout } from "./editor/DocLayout";
import "./App.css";

function App() {
  const editorRef = useRef<Editor | null>(null);

  const { settings, settingsRef, updateSettings, remember } = useSettings();

  const scrollRef = useRef<HTMLDivElement>(null);
  const { setZoomAbs, adjustZoom } = useZoom(scrollRef, updateSettings, settingsRef);

  const {
    tabs,
    setTabs,
    activeId,
    setActiveId,
    activeTab,
    tabsRef,
    activeIdRef,
    markTabDirty,
    switchTab,
    newBlankTab,
    openDocFile,
    closeTab,
  } = useDocumentTabs(editorRef, {
    // Invoked at event time, so referencing the autosave api (declared below)
    // is safe — it exists before any switch/close can happen.
    onLeaveDirtyTab: (tab, html, layout) => {
      cancelAutosave();
      queueSave(tab, html, layout).catch(() => {}); // failure shows in the status bar
    },
    onCloseTab: (id) => forgetTab(id),
    onOpened: remember,
  });

  const {
    queueSave,
    schedule: scheduleAutosave,
    cancel: cancelAutosave,
    noteEdit,
    forgetTab,
  } = useAutosave({ editorRef, tabsRef, activeIdRef, setTabs });

  const {
    handleOpen,
    handleOpenRecent,
    handleSave,
    handleSaveAs,
    handleInsertImage,
    handleExportPdf,
    printJob,
    setPrintJob,
  } = useFileOperations({
    editorRef,
    tabsRef,
    activeIdRef,
    setTabs,
    openDocFile,
    queueSave,
    cancelAutosave,
    remember,
    settings,
  });

  const [showSettings, setShowSettings] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);

  const zoomFactor = (settings.zoom || 100) / 100;

  const markDirty = useCallback(() => {
    const id = activeIdRef.current;
    noteEdit(id);
    markTabDirty(id);
  }, [activeIdRef, noteEdit, markTabDirty]);

  const editor = useEditor({
    extensions: buildExtensions(),
    content: EMPTY_DOC,
    autofocus: true,
    onUpdate: () => {
      markDirty();
      scheduleAutosave();
    },
  });
  editorRef.current = editor;

  // Page/print layout (format, margins, header/footer, heading numbers) is a
  // doc attribute (editor/DocLayout.ts), not a Setting — it travels with the
  // document and Ctrl+Z reverts it like any other edit. `settings` is only
  // the fallback for a document that's never had its own layout set.
  const docLayout = effectiveLayoutFor(editor, settings);
  const pageFormat = docLayout.pageFormat;
  const pageMargins = docLayout.pageMargins;
  const dims = PAGE_SIZES[pageFormat] || PAGE_SIZES.classic;
  const isPaginated = pageFormat !== "classic";

  // Spellcheck: drive the WebView's native checker via DOM attributes so it stays
  // reactive to settings (WebView2 uses system dictionaries; WebKitGTK uses hunspell).
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom as HTMLElement;
    dom.setAttribute("spellcheck", settings.spellcheck === false ? "false" : "true");
    dom.setAttribute("lang", settings.docLang || "pt-BR");
  }, [editor, settings.spellcheck, settings.docLang]);

  // Heading numbering lives in plugin state; keep it in sync with the doc's layout.
  useEffect(() => {
    editor?.commands.setHeadingNumbers(docLayout.numberHeadings);
  }, [editor, docLayout.numberHeadings]);

  // Same for tracked-changes recording.
  useEffect(() => {
    editor?.commands.setTrackChanges(settings.trackChanges === true);
  }, [editor, settings.trackChanges]);

  useCitationRegistry(editor, settings);

  // Local AI engine, shared by the side panel and the selection bubble menu.
  const ai = useLocalAi(editor, settings, updateSettings);

  useAppLifecycle({ editor, editorRef, tabsRef, activeIdRef, setTabs, setActiveId, openDocFile, queueSave, cancelAutosave });

  // ---- Templates ----
  const handleApplyTemplate = useCallback(
    (tmpl: DocTemplate) => {
      if (!editor) return;
      patchDocLayout(editor, settings, {
        pageFormat: tmpl.pageFormat,
        pageMargins: tmpl.margins,
        ...(tmpl.header && { pageHeader: tmpl.header }),
        ...(tmpl.footer && { pageFooter: tmpl.footer }),
        ...(tmpl.chromeOnFirst !== undefined && { pageChromeOnFirst: tmpl.chromeOnFirst }),
      });
      // Deferred out of the React event: setContent instantiates NodeViews
      // (TOC, bibliography) through flushSync, which React rejects mid-render.
      setTimeout(() => {
        // Starter content (cover page etc.) only on an empty doc — never wipe work.
        const { doc } = editor.state;
        if (tmpl.content && doc.textContent.trim() === "" && doc.childCount <= 1) {
          editor.commands.setContent(tmpl.content());
          markDirty();
          // The starter carries its own alignment (centered cover lines) — apply
          // the template's font/spacing but keep the blanket textAlign off.
          applyTemplateContent(editor, { ...tmpl, textAlign: undefined });
        } else {
          applyTemplateContent(editor, tmpl);
        }
      }, 0);
    },
    [editor, settings, markDirty]
  );

  // ---- Versioning ----
  const handleSaveVersion = useCallback(
    async (name: string) => {
      if (!editor) return;
      const at = tabsRef.current.find((t) => t.id === activeIdRef.current);
      if (!at || !at.filePath) {
        window.alert("Salve o documento antes de criar uma versão.");
        return;
      }
      try {
        const content = JSON.stringify(editor.getJSON());
        await invoke("save_version", { docPath: at.filePath, name, content });
      } catch (e) {
        window.alert(`Erro ao salvar versão:\n${e}`);
      }
    },
    [editor]
  );

  const handleRestoreVersion = useCallback(
    async (versionId: string) => {
      if (!editor) return;
      const at = tabsRef.current.find((t) => t.id === activeIdRef.current);
      if (!at || !at.filePath) return;
      try {
        const raw = await invoke<string>("load_version", { docPath: at.filePath, versionId });
        const json = JSON.parse(raw);
        editor.commands.setContent(json, { emitUpdate: false });
        // setContent({emitUpdate:false}) fires no onUpdate, so bump the edit
        // sequence by hand — otherwise a save already in flight for the
        // pre-restore content can complete afterward and clear `dirty`,
        // leaving the restored content unsaved with no warning on quit.
        noteEdit(at.id);
        setTabs((ts) => ts.map((t) => (t.id === at.id ? { ...t, doc: json, dirty: true } : t)));
        const restoredLayout = (editor.state.doc.attrs.layout as DocLayout | null) ?? null;
        queueSave({ id: at.id, filePath: at.filePath, format: at.format }, editor.getHTML(), restoredLayout).catch(() => {});
      } catch (e) {
        window.alert(`Erro ao restaurar versão:\n${e}`);
      }
    },
    [editor, noteEdit, setTabs, queueSave, tabsRef, activeIdRef]
  );

  useKeyboardShortcuts({
    save: handleSave,
    saveAs: handleSaveAs,
    open: handleOpen,
    newTab: newBlankTab,
    closeActiveTab: () => closeTab(activeIdRef.current),
    openSearch: () => setShowSearch(true),
    toggleFocusMode: () => setFocusMode((v) => !v),
    exitFocusMode: () => setFocusMode(false),
    zoomIn: () => adjustZoom(10),
    zoomOut: () => adjustZoom(-10),
    zoomReset: () => setZoomAbs(100),
  });

  const pageStyle = useMemo(() => {
    const style: Record<string, string> = {
      padding: `${pageMargins.top}px ${pageMargins.right}px ${pageMargins.bottom}px ${pageMargins.left}px`,
    };
    if (pageFormat !== "classic") {
      style.width = dims.widthCss;
    }
    return style;
  }, [pageFormat, dims, pageMargins]);

  return (
    <div className={"app" + (focusMode ? " focus-mode" : "")}>
      {focusMode && (
        <button className="focus-exit" onClick={() => setFocusMode(false)} title="Sair do modo foco (Esc ou F11)">
          ✕ foco
        </button>
      )}
      <MenuBar
        aiOpen={aiOpen}
        chaptersOpen={chaptersOpen}
        reviewOpen={reviewOpen}
        onNew={newBlankTab}
        onOpen={handleOpen}
        onSave={handleSave}
        onSaveAs={handleSaveAs}
        onExportPdf={handleExportPdf}
        onToggleAi={() => setAiOpen((v) => !v)}
        onToggleChapters={() => setChaptersOpen((v) => !v)}
        onToggleReview={() => setReviewOpen((v) => !v)}
        onOpenRecent={handleOpenRecent}
        onOpenSettings={() => setShowSettings(true)}
        onVersionHistory={() => setShowVersionHistory((v) => !v)}
      />
      <TabStrip tabs={tabs} activeId={activeId} onSelect={switchTab} onClose={closeTab} onNew={newBlankTab} />
      <EditorProvider editor={editor}>
        <Ribbon onInsertImage={handleInsertImage} onApplyTemplate={handleApplyTemplate} />
        {editor && <AiBubbleMenu editor={editor} ai={ai} onOpenPanel={() => setAiOpen(true)} />}
        <div className="workspace">
          {chaptersOpen && <ChaptersPanel onClose={() => setChaptersOpen(false)} />}
          {reviewOpen && <ReviewPanel onClose={() => setReviewOpen(false)} />}
          <div className="editor-main">
            <div className="editor-scroll" ref={scrollRef}>
              {showSearch && <SearchBar onClose={() => setShowSearch(false)} />}
              <div className="pages-container" style={{ zoom: zoomFactor }}>
                <div className={`page${isPaginated ? " fixed" : ""}`} style={pageStyle}>
                  <EditorContent editor={editor} />
                </div>
              </div>
            </div>
            <StatusBar onZoomChange={setZoomAbs} activeTabId={activeId} />
          </div>
          {aiOpen && <AiPanel editor={editor} ai={ai} onClose={() => setAiOpen(false)} />}
        </div>
      </EditorProvider>
      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          docLayout={docLayout}
          onDocLayoutChange={(patch) => editor && patchDocLayout(editor, settings, patch)}
        />
      )}
      {showVersionHistory && activeTab && (
        <VersionHistory
          tab={activeTab}
          onClose={() => setShowVersionHistory(false)}
          onSaveVersion={handleSaveVersion}
          onRestoreVersion={handleRestoreVersion}
        />
      )}
      {printJob && (
        <PrintPreview html={printJob.html} options={printJob.options} onClose={() => setPrintJob(null)} />
      )}
    </div>
  );
}

export default App;
