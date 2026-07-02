import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ask, open as openDialog } from "@tauri-apps/plugin-dialog";
import { buildExtensions } from "./editor/extensions";
import { MenuBar } from "./editor/MenuBar";
import { Ribbon } from "./editor/Ribbon";
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
import { readAndClearRescue, registerRescueProvider } from "./lib/rescue";
import { DocTemplate, applyTemplateContent } from "./lib/templates";
import { openDocumentPath } from "./lib/document";
import { EMPTY_DOC, newTab } from "./lib/tabs";
import { useDocumentTabs } from "./hooks/useDocumentTabs";
import { useAutosave } from "./hooks/useAutosave";
import { useFileOperations } from "./hooks/useFileOperations";
import { useZoom } from "./hooks/useZoom";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useCitationRegistry } from "./hooks/useCitationRegistry";
import { useGhostPages } from "./hooks/useGhostPages";
import {
  Recent,
  Settings,
  PageFormat,
  PageMargins,
  addRecent,
  applyTheme,
  loadRecents,
  loadSettings,
  saveSettings,
} from "./lib/settings";
import "./App.css";

const PAGE_DIMS: Record<string, { width: string; height: string; pxHeight: number }> = {
  classic: { width: "760px", height: "auto", pxHeight: Infinity },
  a4: { width: "210mm", height: "297mm", pxHeight: 1123 },
  a5: { width: "148mm", height: "210mm", pxHeight: 794 },
  letter: { width: "215.9mm", height: "279.4mm", pxHeight: 1056 },
  a3: { width: "297mm", height: "420mm", pxHeight: 1587 },
};

function App() {
  const editorRef = useRef<Editor | null>(null);

  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [recents, setRecents] = useState<Recent[]>(() => loadRecents());

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    const next = saveSettings(patch);
    setSettings(next);
    if (patch.theme) applyTheme(patch.theme);
  }, []);

  const remember = useCallback((path: string) => setRecents(addRecent(path)), []);

  const scrollRef = useRef<HTMLDivElement>(null);
  const { setZoomAbs, adjustZoom } = useZoom(scrollRef, updateSettings);

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
    onLeaveDirtyTab: (tab, html) => {
      cancelAutosave();
      queueSave(tab, html).catch(() => {}); // failure shows in the status bar
    },
    onCloseTab: (id) => forgetTab(id),
    onOpened: remember,
  });

  const {
    status: saveStatus,
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
  });

  const [showSettings, setShowSettings] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [systemFonts, setSystemFonts] = useState<string[]>([]);

  const pageFormat = settings.pageFormat || "classic";
  const pageMargins = settings.pageMargins || { top: 56, bottom: 56, left: 72, right: 72 };
  const customFonts = settings.customFonts || [];
  const zoom = settings.zoom || 100;
  const zoomFactor = zoom / 100;

  const dims = PAGE_DIMS[pageFormat] || PAGE_DIMS.classic;
  const isPaginated = pageFormat !== "classic";

  useEffect(() => {
    applyTheme(settings.theme);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load system fonts
  useEffect(() => {
    invoke<string[]>("list_system_fonts")
      .then((fonts) => setSystemFonts(fonts))
      .catch(() => {});
  }, []);

  // Re-register custom fonts on startup
  useEffect(() => {
    if (!customFonts.length) return;
    let cancelled = false;
    (async () => {
      for (const font of customFonts) {
        if (cancelled) break;
        try {
          const info = await invoke<{ name: string; base64: string }>("import_font", { path: font.path });
          const ff = new FontFace(info.name, `url('data:font/ttf;base64,${info.base64}')`);
          await ff.load();
          document.fonts.add(ff);
        } catch { /* skip fonts that can't be loaded */ }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const { ghostPages, ghostHtml } = useGhostPages(editor, {
    isPaginated,
    pageFormat,
    pageHeightPx: dims.pxHeight,
    pageMargins,
    zoomFactor,
  });

  // Spellcheck: drive the WebView's native checker via DOM attributes so it stays
  // reactive to settings (WebView2 uses system dictionaries; WebKitGTK uses hunspell).
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom as HTMLElement;
    dom.setAttribute("spellcheck", settings.spellcheck === false ? "false" : "true");
    dom.setAttribute("lang", settings.docLang || "pt-BR");
  }, [editor, settings.spellcheck, settings.docLang]);

  // Heading numbering lives in plugin state; keep it in sync with the setting.
  useEffect(() => {
    editor?.commands.setHeadingNumbers(settings.numberHeadings === true);
  }, [editor, settings.numberHeadings]);

  // Same for tracked-changes recording.
  useEffect(() => {
    editor?.commands.setTrackChanges(settings.trackChanges === true);
  }, [editor, settings.trackChanges]);

  useCitationRegistry(editor, settings);

  // Local AI engine, shared by the side panel and the selection bubble menu.
  const ai = useLocalAi(editor, settings, updateSettings);

  // Crash rescue: tell the ErrorBoundary how to snapshot the open tabs, and
  // offer to restore a snapshot left behind by a previous crash.
  useEffect(() => {
    return registerRescueProvider(() => {
      let activeDoc = null;
      try {
        activeDoc = editor?.getJSON() ?? null;
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
  }, [editor]);

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
  }, [editor]);

  // ---- Font import ----
  const handleImportFont = useCallback(async () => {
    try {
      const selected = await openDialog({
        multiple: false,
        filters: [
          { name: "Fontes", extensions: ["ttf", "otf", "ttc"] },
        ],
      });
      if (!selected || Array.isArray(selected)) return;
      const info = await invoke<{ name: string; base64: string }>("import_font", { path: selected });
      const fontName = info.name;
      const dataUrl = `url('data:font/ttf;base64,${info.base64}')`;
      const fontFace = new FontFace(fontName, dataUrl);
      await fontFace.load();
      document.fonts.add(fontFace);
      const existing = customFonts.find((f) => f.name === fontName || f.path === selected);
      if (!existing) {
        const next = [...customFonts, { name: fontName, path: selected }];
        updateSettings({ customFonts: next });
      }
    } catch (e) {
      window.alert(`Não foi possível importar a fonte:\n${e}`);
    }
  }, [customFonts, updateSettings]);

  // ---- Page format / margins ----
  const handlePageFormatChange = useCallback(
    (format: PageFormat) => updateSettings({ pageFormat: format }),
    [updateSettings]
  );

  const handleMarginsChange = useCallback(
    (margins: PageMargins) => updateSettings({ pageMargins: margins }),
    [updateSettings]
  );

  // ---- Templates ----
  const handleApplyTemplate = useCallback(
    (tmpl: DocTemplate) => {
      updateSettings({
        pageFormat: tmpl.pageFormat,
        pageMargins: tmpl.margins,
        ...(tmpl.header && { pageHeader: tmpl.header }),
        ...(tmpl.footer && { pageFooter: tmpl.footer }),
        ...(tmpl.chromeOnFirst !== undefined && { pageChromeOnFirst: tmpl.chromeOnFirst }),
      });
      if (!editor) return;
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
    [editor, updateSettings, markDirty]
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
        setTabs((ts) => ts.map((t) => (t.id === at.id ? { ...t, doc: json, dirty: true } : t)));
      } catch (e) {
        window.alert(`Erro ao restaurar versão:\n${e}`);
      }
    },
    [editor]
  );

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
      style.width = dims.width;
      style.height = dims.height;
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
        recents={recents}
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
      {editor && (
        <Ribbon
          editor={editor}
          onInsertImage={handleInsertImage}
          pageFormat={pageFormat}
          onPageFormatChange={handlePageFormatChange}
          pageMargins={pageMargins}
          onMarginsChange={handleMarginsChange}
          systemFonts={systemFonts}
          customFonts={customFonts}
          onImportFont={handleImportFont}
          onApplyTemplate={handleApplyTemplate}
          numberHeadings={settings.numberHeadings === true}
          onToggleHeadingNumbers={() => updateSettings({ numberHeadings: !settings.numberHeadings })}
        />
      )}
      {editor && <AiBubbleMenu editor={editor} ai={ai} onOpenPanel={() => setAiOpen(true)} />}
      <div className="workspace">
        {chaptersOpen && editor && <ChaptersPanel editor={editor} onClose={() => setChaptersOpen(false)} />}
        {reviewOpen && editor && (
          <ReviewPanel
            editor={editor}
            trackChanges={settings.trackChanges === true}
            onToggleTrackChanges={() => updateSettings({ trackChanges: !settings.trackChanges })}
            authorName={settings.authorName || "Autor"}
            onClose={() => setReviewOpen(false)}
          />
        )}
        <div className="editor-main">
          <div className="editor-scroll" ref={scrollRef}>
            {showSearch && editor && <SearchBar editor={editor} onClose={() => setShowSearch(false)} />}
            <div className={`pages-container${isPaginated ? " paginated" : ""}`} style={{ zoom: zoomFactor }}>
              <div className={`page${isPaginated ? " fixed" : ""}`} style={pageStyle}>
                {isPaginated ? (
                  <div className="page-clip">
                    <EditorContent editor={editor} />
                  </div>
                ) : (
                  <EditorContent editor={editor} />
                )}
              </div>
              {isPaginated &&
                ghostPages.map((pg, i) => (
                  // Same padding/width as the editable page (via pageStyle) so the
                  // mirror reflows identically — otherwise offsets don't line up.
                  <div key={i} className="page fixed" style={pageStyle}>
                    <div className="page-clip" style={{ height: pg.height }}>
                      <div
                        className="page-ghost ProseMirror"
                        style={{ transform: `translateY(-${pg.top}px)` }}
                        dangerouslySetInnerHTML={{ __html: ghostHtml }}
                      />
                    </div>
                  </div>
                ))}
            </div>
          </div>
          {editor && (
            <StatusBar
              editor={editor}
              pageFormat={pageFormat}
              zoom={zoom}
              zoomFactor={zoomFactor}
              onZoomChange={setZoomAbs}
              measuredPages={isPaginated ? ghostPages.length + 1 : undefined}
              wordGoal={settings.wordGoal || 0}
              saveStatus={saveStatus}
            />
          )}
        </div>
        {aiOpen && <AiPanel editor={editor} ai={ai} onClose={() => setAiOpen(false)} />}
      </div>
      {showSettings && (
        <SettingsModal settings={settings} onChange={updateSettings} onClose={() => setShowSettings(false)} />
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
