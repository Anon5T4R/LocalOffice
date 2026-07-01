import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ask, open as openDialog } from "@tauri-apps/plugin-dialog";
import { buildExtensions } from "./editor/extensions";
import { MenuBar } from "./editor/MenuBar";
import { Ribbon } from "./editor/Ribbon";
import { TabStrip } from "./editor/TabStrip";
import { SearchBar } from "./editor/search/SearchBar";
import { ChaptersPanel } from "./editor/ChaptersPanel";
import { StatusBar } from "./editor/StatusBar";
import { AiPanel } from "./ai/AiPanel";
import { AiBubbleMenu } from "./ai/AiBubbleMenu";
import { useLocalAi } from "./ai/useLocalAi";
import { SettingsModal } from "./SettingsModal";
import { VersionHistory } from "./VersionHistory";
import { pickImageDataUri } from "./lib/images";
import { exportToPdf } from "./lib/pdf";
import { DocTemplate } from "./lib/templates";
import {
  DocFile,
  baseName,
  openDocument,
  openDocumentPath,
  saveDocumentAs,
  saveDocumentTo,
} from "./lib/document";
import { Tab, EMPTY_DOC, newTab, tabTitle } from "./lib/tabs";
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
  const first = useRef<Tab>(newTab());
  const [tabs, setTabs] = useState<Tab[]>(() => [first.current]);
  const [activeId, setActiveId] = useState<string>(first.current.id);

  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [recents, setRecents] = useState<Recent[]>(() => loadRecents());
  const [showSettings, setShowSettings] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [systemFonts, setSystemFonts] = useState<string[]>([]);
  const [ghostPageCount, setGhostPageCount] = useState(0);
  const [ghostHtml, setGhostHtml] = useState("");

  const pageFormat = settings.pageFormat || "classic";
  const pageMargins = settings.pageMargins || { top: 56, bottom: 56, left: 72, right: 72 };
  const customFonts = settings.customFonts || [];

  const dims = PAGE_DIMS[pageFormat] || PAGE_DIMS.classic;
  const isPaginated = pageFormat !== "classic";

  // Refs so timers / editor callbacks always see fresh state.
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

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

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    const next = saveSettings(patch);
    setSettings(next);
    if (patch.theme) applyTheme(patch.theme);
  }, []);

  const remember = useCallback((path: string) => setRecents(addRecent(path)), []);

  const markDirty = useCallback(() => {
    const id = activeIdRef.current;
    setTabs((ts) => ts.map((t) => (t.id === id && !t.dirty ? { ...t, dirty: true } : t)));
  }, []);

  // Debounced autosave: only writes when you pause typing (zero cost while typing),
  // and never loses more than a couple seconds of work. `scheduleRef` always points
  // to the latest scheduler so the editor's onUpdate can call it.
  const scheduleRef = useRef<() => void>(() => {});
  const autosaveTimer = useRef<number | null>(null);
  const firstDirtyAt = useRef(0);

  const savingRef = useRef(false);

  const cancelAutosave = useCallback(() => {
    if (autosaveTimer.current) {
      clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }
    firstDirtyAt.current = 0;
  }, []);

  const editor = useEditor({
    extensions: buildExtensions(),
    content: first.current.doc,
    autofocus: true,
    onUpdate: () => {
      markDirty();
      scheduleRef.current();
    },
  });

  // Recalculate ghost pages
  useEffect(() => {
    if (!editor || !isPaginated) {
      setGhostPageCount(0);
      setGhostHtml("");
      return;
    }
    const el = editor.view.dom;
    const totalH = el.scrollHeight;
    const pageH = dims.pxHeight;
    const count = Math.max(1, Math.ceil(totalH / pageH));
    setGhostPageCount(count);
    setGhostHtml(editor.getHTML());
  }, [editor, pageFormat, dims.pxHeight, isPaginated]);

  // Update ghosts on content change
  useEffect(() => {
    if (!editor || !isPaginated) return;
    const ro = new ResizeObserver(() => {
      const el = editor.view.dom;
      const totalH = el.scrollHeight;
      const pageH = dims.pxHeight;
      const count = Math.max(1, Math.ceil(totalH / pageH));
      setGhostPageCount(count);
      setGhostHtml(editor.getHTML());
    });
    ro.observe(editor.view.dom);
    return () => ro.disconnect();
  }, [editor, pageFormat, dims.pxHeight, isPaginated]);

  // Local AI engine, shared by the side panel and the selection bubble menu.
  const ai = useLocalAi(editor, settings, updateSettings);

  // ---- Tab operations (single editor, content swap) ----

  const switchTab = useCallback(
    (id: string) => {
      if (!editor || id === activeIdRef.current) return;
      const oldId = activeIdRef.current;
      const json = editor.getJSON();
      const target = tabsRef.current.find((t) => t.id === id);
      if (!target) return;
      setTabs((ts) => ts.map((t) => (t.id === oldId ? { ...t, doc: json } : t)));
      editor.commands.setContent(target.doc, { emitUpdate: false });
      setActiveId(id);
    },
    [editor]
  );

  const newBlankTab = useCallback(() => {
    if (!editor) return;
    const oldId = activeIdRef.current;
    const json = editor.getJSON();
    const t = newTab();
    setTabs((ts) => ts.map((x) => (x.id === oldId ? { ...x, doc: json } : x)).concat(t));
    editor.commands.setContent(EMPTY_DOC, { emitUpdate: false });
    setActiveId(t.id);
  }, [editor]);

  const openDocFile = useCallback(
    (doc: DocFile) => {
      if (!editor) return;
      const oldId = activeIdRef.current;
      const active = tabsRef.current.find((t) => t.id === oldId);
      const reuse = !!active && !active.filePath && !active.dirty;

      if (reuse) {
        editor.commands.setContent(doc.html, { emitUpdate: false });
        const json = editor.getJSON();
        setTabs((ts) =>
          ts.map((t) => (t.id === oldId ? { ...t, filePath: doc.path, format: doc.format, doc: json, dirty: false } : t))
        );
      } else {
        const oldJson = editor.getJSON();
        editor.commands.setContent(doc.html, { emitUpdate: false });
        const newJson = editor.getJSON();
        const t = newTab({ filePath: doc.path, format: doc.format, doc: newJson, dirty: false });
        setTabs((ts) => ts.map((x) => (x.id === oldId ? { ...x, doc: oldJson } : x)).concat(t));
        setActiveId(t.id);
      }
      remember(doc.path);
    },
    [editor, remember]
  );

  const closeTab = useCallback(
    (id: string) => {
      const t = tabsRef.current.find((x) => x.id === id);
      if (!t || !editor) return;
      if (t.dirty && !window.confirm(`"${tabTitle(t)}" tem alterações não salvas. Fechar mesmo assim?`)) return;

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
    },
    [editor]
  );

  // ---- File operations ----

  const handleOpen = useCallback(async () => {
    try {
      const doc = await openDocument();
      if (doc) openDocFile(doc);
    } catch (e) {
      window.alert(`Não foi possível abrir:\n${e}`);
    }
  }, [openDocFile]);

  const handleOpenRecent = useCallback(
    async (path: string) => {
      try {
        openDocFile(await openDocumentPath(path));
      } catch (e) {
        window.alert(`Não foi possível abrir:\n${e}`);
      }
    },
    [openDocFile]
  );

  const handleSaveAs = useCallback(async () => {
    if (!editor) return;
    const at = tabsRef.current.find((t) => t.id === activeIdRef.current);
    const suggested = at?.filePath ? baseName(at.filePath) : "sem-titulo.md";
    try {
      const doc = await saveDocumentAs(editor.getHTML(), suggested);
      if (doc) {
        const id = activeIdRef.current;
        setTabs((ts) => ts.map((t) => (t.id === id ? { ...t, filePath: doc.path, format: doc.format, dirty: false } : t)));
        remember(doc.path);
        cancelAutosave();
      }
    } catch (e) {
      window.alert(`Não foi possível salvar:\n${e}`);
    }
  }, [editor, remember, cancelAutosave]);

  const handleSave = useCallback(async () => {
    if (!editor) return;
    const at = tabsRef.current.find((t) => t.id === activeIdRef.current);
    if (!at) return;
    if (!at.filePath) {
      await handleSaveAs();
      return;
    }
    try {
      await saveDocumentTo(at.filePath, editor.getHTML(), at.format);
      setTabs((ts) => ts.map((t) => (t.id === at.id ? { ...t, dirty: false } : t)));
      remember(at.filePath);
      cancelAutosave();
    } catch (e) {
      window.alert(`Não foi possível salvar:\n${e}`);
    }
  }, [editor, handleSaveAs, remember, cancelAutosave]);

  const handleInsertImage = useCallback(async () => {
    if (!editor) return;
    const dataUri = await pickImageDataUri();
    if (dataUri) editor.chain().focus().setImage({ src: dataUri }).run();
  }, [editor]);

  const handleExportPdf = useCallback(() => {
    if (!editor) return;
    exportToPdf(editor.getHTML());
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
      });
      if (!editor) return;
      // Apply content formatting (font, size, line-height, alignment)
      const { doc } = editor.state;
      const ops: (() => boolean)[] = [];

      doc.descendants((node, pos) => {
        if (!node.type.isText && node.content.size === 0) return;

        // Font family + size via textStyle mark
        const markAttrs: Record<string, string> = {};
        if (tmpl.fontFamily) markAttrs.fontFamily = tmpl.fontFamily;
        if (tmpl.fontSize) markAttrs.fontSize = tmpl.fontSize;
        if (Object.keys(markAttrs).length > 0) {
          const from = pos;
          const to = pos + node.nodeSize;
          ops.push(() =>
            editor.chain().setTextSelection({ from, to }).setMark("textStyle", markAttrs).run()
          );
        }

        // Line height via node attribute
        if (tmpl.lineHeight && (node.type.name === "paragraph" || node.type.name === "heading")) {
          ops.push(() =>
            editor.chain().setTextSelection({ from: pos, to: pos + node.nodeSize })
              .updateAttributes(node.type.name, { lineHeight: tmpl.lineHeight }).run()
          );
        }

        // Text alignment
        if (tmpl.textAlign && (node.type.name === "paragraph" || node.type.name === "heading")) {
          ops.push(() =>
            editor.chain().setTextSelection({ from: pos, to: pos + node.nodeSize })
              .setTextAlign(tmpl.textAlign!).run()
          );
        }
      });

      ops.forEach((fn) => fn());
    },
    [editor, updateSettings]
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

  // ---- Debounced autosave (only when idle; never while actively typing) ----
  const doAutosave = useCallback(() => {
    if (savingRef.current) return;
    autosaveTimer.current = null;
    firstDirtyAt.current = 0;
    if (!editor) return;
    const at = tabsRef.current.find((t) => t.id === activeIdRef.current);
    if (at && at.filePath && at.dirty) {
      const id = at.id;
      savingRef.current = true;
      saveDocumentTo(at.filePath, editor.getHTML(), at.format)
        .then(() => {
          setTabs((ts) => ts.map((t) => (t.id === id ? { ...t, dirty: false } : t)));
          savingRef.current = false;
        })
        .catch(() => { savingRef.current = false; });
    }
  }, [editor]);

  const scheduleAutosave = useCallback(() => {
    const at = tabsRef.current.find((t) => t.id === activeIdRef.current);
    if (!at || !at.filePath) return;
    const now = Date.now();
    if (firstDirtyAt.current === 0) firstDirtyAt.current = now;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    if (now - firstDirtyAt.current >= 60000) {
      doAutosave();
      return;
    }
    const delay = at.format === "docx" || at.format === "odt" ? 4000 : 2000;
    autosaveTimer.current = window.setTimeout(doAutosave, delay);
  }, [doAutosave]);

  scheduleRef.current = scheduleAutosave;

  useEffect(() => {
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
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

  // ---- Keyboard shortcuts ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === "s" && e.shiftKey) {
        e.preventDefault();
        handleSaveAs();
      } else if (k === "s") {
        e.preventDefault();
        handleSave();
      } else if (k === "o") {
        e.preventDefault();
        handleOpen();
      } else if (k === "n" || k === "t") {
        e.preventDefault();
        newBlankTab();
      } else if (k === "f") {
        e.preventDefault();
        setShowSearch(true);
      } else if (k === "w") {
        e.preventDefault();
        closeTab(activeIdRef.current);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleSave, handleSaveAs, handleOpen, newBlankTab, closeTab]);

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

  const activeTab = tabs.find((t) => t.id === activeId);

  // Use a ref to measure page height in px for ghost calculations
  const ghostOffsetPx = useMemo(() => {
    if (!isPaginated) return [];
    const ph = dims.pxHeight;
    return Array.from({ length: Math.max(0, ghostPageCount - 1) }, (_, i) => (i + 1) * ph);
  }, [isPaginated, dims.pxHeight, ghostPageCount]);

  return (
    <div className="app">
      <MenuBar
        aiOpen={aiOpen}
        chaptersOpen={chaptersOpen}
        recents={recents}
        onNew={newBlankTab}
        onOpen={handleOpen}
        onSave={handleSave}
        onSaveAs={handleSaveAs}
        onExportPdf={handleExportPdf}
        onToggleAi={() => setAiOpen((v) => !v)}
        onToggleChapters={() => setChaptersOpen((v) => !v)}
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
        />
      )}
      {editor && <AiBubbleMenu editor={editor} ai={ai} onOpenPanel={() => setAiOpen(true)} />}
      <div className="workspace">
        {chaptersOpen && editor && <ChaptersPanel editor={editor} onClose={() => setChaptersOpen(false)} />}
        <div className="editor-main">
          <div className="editor-scroll">
            {showSearch && editor && <SearchBar editor={editor} onClose={() => setShowSearch(false)} />}
            <div className={`pages-container${isPaginated ? " paginated" : ""}`}>
              <div className={`page${isPaginated ? " fixed" : ""}`} style={pageStyle}>
                <EditorContent editor={editor} />
              </div>
              {isPaginated &&
                ghostOffsetPx.map((offset, i) => (
                  <div key={i} className="page fixed" style={{ width: dims.width, height: dims.height }}>
                    <div
                      className="page-ghost ProseMirror"
                      style={{ transform: `translateY(-${offset}px)` }}
                      dangerouslySetInnerHTML={{ __html: ghostHtml }}
                    />
                  </div>
                ))}
            </div>
          </div>
          {editor && <StatusBar editor={editor} pageFormat={pageFormat} />}
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
    </div>
  );
}

export default App;
