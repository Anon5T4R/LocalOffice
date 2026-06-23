import { useCallback, useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { buildExtensions } from "./editor/extensions";
import { MenuBar } from "./editor/MenuBar";
import { Ribbon } from "./editor/Ribbon";
import { TabStrip } from "./editor/TabStrip";
import { SearchBar } from "./editor/search/SearchBar";
import { ChaptersPanel } from "./editor/ChaptersPanel";
import { AiPanel } from "./ai/AiPanel";
import { SettingsModal } from "./SettingsModal";
import { pickImageDataUri } from "./lib/images";
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
  addRecent,
  applyTheme,
  loadRecents,
  loadSettings,
  saveSettings,
} from "./lib/settings";
import "./App.css";

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

  // Refs so timers / editor callbacks always see fresh state.
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

  useEffect(() => {
    applyTheme(settings.theme);
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

  const editor = useEditor({
    extensions: buildExtensions(),
    content: first.current.doc,
    autofocus: true,
    onUpdate: () => markDirty(),
  });

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
      }
    } catch (e) {
      window.alert(`Não foi possível salvar:\n${e}`);
    }
  }, [editor, remember]);

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
    } catch (e) {
      window.alert(`Não foi possível salvar:\n${e}`);
    }
  }, [editor, handleSaveAs, remember]);

  const handleInsertImage = useCallback(async () => {
    if (!editor) return;
    const dataUri = await pickImageDataUri();
    if (dataUri) editor.chain().focus().setImage({ src: dataUri }).run();
  }, [editor]);

  // ---- Autosave (active tab, every 60s, only if it has a path) ----
  useEffect(() => {
    if (!editor) return;
    const iv = setInterval(() => {
      const at = tabsRef.current.find((t) => t.id === activeIdRef.current);
      if (at && at.filePath && at.dirty) {
        saveDocumentTo(at.filePath, editor.getHTML(), at.format)
          .then(() => setTabs((ts) => ts.map((t) => (t.id === at.id ? { ...t, dirty: false } : t))))
          .catch(() => {});
      }
    }, 60000);
    return () => clearInterval(iv);
  }, [editor]);

  // ---- Open a file passed at launch / forwarded by a 2nd instance ----
  const openedStartup = useRef(false);
  useEffect(() => {
    if (!editor || openedStartup.current) return;
    openedStartup.current = true;
    invoke<string | null>("get_startup_file")
      .then((p) => {
        if (p) openDocumentPath(p).then(openDocFile).catch(() => {});
      })
      .catch(() => {});
    const un = listen<string>("open-file", (e) => {
      if (e.payload) openDocumentPath(e.payload).then(openDocFile).catch(() => {});
    });
    return () => {
      un.then((f) => f());
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
        onToggleAi={() => setAiOpen((v) => !v)}
        onToggleChapters={() => setChaptersOpen((v) => !v)}
        onOpenRecent={handleOpenRecent}
        onOpenSettings={() => setShowSettings(true)}
      />
      <TabStrip tabs={tabs} activeId={activeId} onSelect={switchTab} onClose={closeTab} onNew={newBlankTab} />
      {editor && <Ribbon editor={editor} onInsertImage={handleInsertImage} />}
      <div className="workspace">
        {chaptersOpen && editor && <ChaptersPanel editor={editor} onClose={() => setChaptersOpen(false)} />}
        <div className="editor-scroll">
          {showSearch && editor && <SearchBar editor={editor} onClose={() => setShowSearch(false)} />}
          <div className="page">
            <EditorContent editor={editor} className="editor" />
          </div>
        </div>
        {aiOpen && (
          <AiPanel editor={editor} settings={settings} onPersist={updateSettings} onClose={() => setAiOpen(false)} />
        )}
      </div>
      {showSettings && (
        <SettingsModal settings={settings} onChange={updateSettings} onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}

export default App;
