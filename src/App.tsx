import { useCallback, useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { buildExtensions } from "./editor/extensions";
import { MenuBar } from "./editor/MenuBar";
import { Ribbon } from "./editor/Ribbon";
import { AiPanel } from "./ai/AiPanel";
import { SettingsModal } from "./SettingsModal";
import { pickImageDataUri } from "./lib/images";
import {
  DocFile,
  DocFormat,
  baseName,
  openDocument,
  openDocumentPath,
  saveDocumentAs,
  saveDocumentTo,
} from "./lib/document";
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

const EMPTY_DOC = "<p></p>";

function App() {
  const [filePath, setFilePath] = useState<string | null>(null);
  const [format, setFormat] = useState<DocFormat>("markdown");
  const [dirty, setDirty] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [recents, setRecents] = useState<Recent[]>(() => loadRecents());
  const [showSettings, setShowSettings] = useState(false);

  // Apply persisted theme on startup.
  useEffect(() => {
    applyTheme(settings.theme);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    const next = saveSettings(patch);
    setSettings(next);
    if (patch.theme) applyTheme(patch.theme);
  }, []);

  const remember = useCallback((path: string) => {
    setRecents(addRecent(path));
  }, []);

  const editor = useEditor({
    extensions: buildExtensions(),
    content: EMPTY_DOC,
    autofocus: true,
    // setContent uses emitUpdate:false on load, so onUpdate only fires on real edits.
    onUpdate: () => setDirty(true),
  });

  const load = useCallback(
    (doc: DocFile) => {
      if (!editor) return;
      editor.commands.setContent(doc.html, { emitUpdate: false });
      setFilePath(doc.path);
      setFormat(doc.format);
      setDirty(false);
      remember(doc.path);
    },
    [editor, remember]
  );

  const confirmDiscard = useCallback(() => {
    if (!dirty) return true;
    return window.confirm("Há alterações não salvas. Descartar?");
  }, [dirty]);

  const handleOpenRecent = useCallback(
    async (path: string) => {
      if (!confirmDiscard()) return;
      try {
        load(await openDocumentPath(path));
      } catch (e) {
        window.alert(`Não foi possível abrir:\n${e}`);
      }
    },
    [load, confirmDiscard]
  );

  const handleNew = useCallback(() => {
    if (!editor || !confirmDiscard()) return;
    editor.commands.setContent(EMPTY_DOC, { emitUpdate: false });
    setFilePath(null);
    setFormat("markdown");
    setDirty(false);
  }, [editor, confirmDiscard]);

  const handleOpen = useCallback(async () => {
    if (!confirmDiscard()) return;
    try {
      const doc = await openDocument();
      if (doc) load(doc);
    } catch (e) {
      window.alert(`Não foi possível abrir:\n${e}`);
    }
  }, [confirmDiscard, load]);

  const handleSaveAs = useCallback(async () => {
    if (!editor) return false;
    const suggested = filePath ? baseName(filePath) : "sem-titulo.md";
    try {
      const doc = await saveDocumentAs(editor.getHTML(), suggested);
      if (doc) {
        setFilePath(doc.path);
        setFormat(doc.format);
        setDirty(false);
        remember(doc.path);
        return true;
      }
    } catch (e) {
      window.alert(`Não foi possível salvar:\n${e}`);
    }
    return false;
  }, [editor, filePath, remember]);

  const handleSave = useCallback(async () => {
    if (!editor) return;
    if (!filePath) {
      await handleSaveAs();
      return;
    }
    try {
      await saveDocumentTo(filePath, editor.getHTML(), format);
      setDirty(false);
      remember(filePath);
    } catch (e) {
      window.alert(`Não foi possível salvar:\n${e}`);
    }
  }, [editor, filePath, format, handleSaveAs, remember]);

  const handleInsertImage = useCallback(async () => {
    if (!editor) return;
    const dataUri = await pickImageDataUri();
    if (dataUri) editor.chain().focus().setImage({ src: dataUri }).run();
  }, [editor]);

  // Keyboard shortcuts
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
      } else if (k === "n") {
        e.preventDefault();
        handleNew();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleSave, handleSaveAs, handleOpen, handleNew]);

  const fileName = filePath ? baseName(filePath) : "sem título";

  return (
    <div className="app">
      <MenuBar
        fileName={fileName}
        dirty={dirty}
        aiOpen={aiOpen}
        recents={recents}
        onNew={handleNew}
        onOpen={handleOpen}
        onSave={handleSave}
        onSaveAs={handleSaveAs}
        onToggleAi={() => setAiOpen((v) => !v)}
        onOpenRecent={handleOpenRecent}
        onOpenSettings={() => setShowSettings(true)}
      />
      {editor && <Ribbon editor={editor} onInsertImage={handleInsertImage} />}
      <div className="workspace">
        <div className="editor-scroll">
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
