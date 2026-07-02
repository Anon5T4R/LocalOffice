import { useCallback, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { Editor } from "@tiptap/react";
import { baseName, openDocument, openDocumentPath, saveDocumentAs, type DocFile } from "../lib/document";
import { pickImageDataUri } from "../lib/images";
import type { PrintOptions } from "../lib/pdf";
import { loadSettings } from "../lib/settings";
import { tabTitle, type Tab } from "../lib/tabs";
import type { SavableTab } from "./useDocumentTabs";

interface FileOperationsDeps {
  editorRef: RefObject<Editor | null>;
  tabsRef: RefObject<Tab[]>;
  activeIdRef: RefObject<string>;
  setTabs: Dispatch<SetStateAction<Tab[]>>;
  openDocFile: (doc: DocFile) => void;
  queueSave: (tab: SavableTab, html: string) => Promise<void>;
  cancelAutosave: () => void;
  remember: (path: string) => void;
}

/** Open/save/export operations for the active tab (dialogs included). */
export function useFileOperations({
  editorRef,
  tabsRef,
  activeIdRef,
  setTabs,
  openDocFile,
  queueSave,
  cancelAutosave,
  remember,
}: FileOperationsDeps) {
  const [printJob, setPrintJob] = useState<{ html: string; options: PrintOptions } | null>(null);

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
    const editor = editorRef.current;
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
  }, [editorRef, tabsRef, activeIdRef, setTabs, remember, cancelAutosave]);

  const handleSave = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor) return;
    const at = tabsRef.current.find((t) => t.id === activeIdRef.current);
    if (!at) return;
    if (!at.filePath) {
      await handleSaveAs();
      return;
    }
    try {
      await queueSave({ id: at.id, filePath: at.filePath, format: at.format }, editor.getHTML());
      remember(at.filePath);
      cancelAutosave();
    } catch (e) {
      window.alert(`Não foi possível salvar:\n${e}`);
    }
  }, [editorRef, tabsRef, activeIdRef, handleSaveAs, queueSave, remember, cancelAutosave]);

  const handleInsertImage = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor) return;
    const dataUri = await pickImageDataUri();
    if (dataUri) editor.chain().focus().setImage({ src: dataUri }).run();
  }, [editorRef]);

  // Snapshot the document and settings at click time; the preview modal
  // paginates that snapshot and prints exactly what it shows.
  const handleExportPdf = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const at = tabsRef.current.find((t) => t.id === activeIdRef.current);
    const s = loadSettings();
    setPrintJob({
      html: editor.getHTML(),
      options: {
        title: at ? tabTitle(at) : "Documento",
        pageFormat: s.pageFormat || "a4",
        margins: s.pageMargins,
        header: s.pageHeader,
        footer: s.pageFooter,
        chromeOnFirst: s.pageChromeOnFirst !== false,
        numberHeadings: s.numberHeadings === true,
      },
    });
  }, [editorRef, tabsRef, activeIdRef]);

  return { handleOpen, handleOpenRecent, handleSave, handleSaveAs, handleInsertImage, handleExportPdf, printJob, setPrintJob };
}
