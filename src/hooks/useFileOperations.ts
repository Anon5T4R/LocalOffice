import { useCallback, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { Editor } from "@tiptap/react";
import { baseName, openDocument, openDocumentPath, saveDocumentAs, type DocFile } from "../lib/document";
import { pickImageDataUri } from "../lib/images";
import type { PrintOptions } from "../lib/pdf";
import type { Settings } from "../lib/settings";
import { tabTitle, type Tab } from "../lib/tabs";
import { chromeRange, effectiveLayout, type DocLayout } from "../editor/DocLayout";
import { getPageCount } from "../editor/PageBreaks";
import type { SavableTab } from "./useDocumentTabs";

interface FileOperationsDeps {
  editorRef: RefObject<Editor | null>;
  tabsRef: RefObject<Tab[]>;
  activeIdRef: RefObject<string>;
  setTabs: Dispatch<SetStateAction<Tab[]>>;
  openDocFile: (doc: DocFile) => void;
  queueSave: (tab: SavableTab, html: string, layout: DocLayout | null) => Promise<void>;
  cancelAutosave: () => void;
  remember: (path: string) => void;
  settings: Settings;
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
  settings,
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
      const layout = effectiveLayout(editor.state.doc, settings);
      const doc = await saveDocumentAs(editor.getHTML(), layout, suggested);
      if (doc) {
        const id = activeIdRef.current;
        setTabs((ts) => ts.map((t) => (t.id === id ? { ...t, filePath: doc.path, format: doc.format, dirty: false } : t)));
        remember(doc.path);
        cancelAutosave();
      }
    } catch (e) {
      window.alert(`Não foi possível salvar:\n${e}`);
    }
  }, [editorRef, tabsRef, activeIdRef, setTabs, remember, cancelAutosave, settings]);

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
      const layout = effectiveLayout(editor.state.doc, settings);
      await queueSave({ id: at.id, filePath: at.filePath, format: at.format }, editor.getHTML(), layout);
      remember(at.filePath);
      cancelAutosave();
    } catch (e) {
      window.alert(`Não foi possível salvar:\n${e}`);
    }
  }, [editorRef, tabsRef, activeIdRef, handleSaveAs, queueSave, remember, cancelAutosave, settings]);

  const handleInsertImage = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor) return;
    const dataUri = await pickImageDataUri();
    if (dataUri) editor.chain().focus().setImage({ src: dataUri }).run();
  }, [editorRef]);

  // Snapshot the document at click time; the preview modal paginates that
  // snapshot and prints exactly what it shows.
  const handleExportPdf = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const at = tabsRef.current.find((t) => t.id === activeIdRef.current);
    const layout = effectiveLayout(editor.state.doc, settings);
    setPrintJob({
      html: editor.getHTML(),
      options: {
        title: at ? tabTitle(at) : "Documento",
        pageFormat: layout.pageFormat,
        margins: layout.pageMargins,
        header: layout.pageHeader,
        footer: layout.pageFooter,
        chromeFrom: chromeRange(layout).from,
        numberStart: chromeRange(layout).startValue,
        pageCount: getPageCount(editor.state),
        numberHeadings: layout.numberHeadings,
        styles: layout.styles ?? null,
      },
    });
  }, [editorRef, tabsRef, activeIdRef, settings]);

  return { handleOpen, handleOpenRecent, handleSave, handleSaveAs, handleInsertImage, handleExportPdf, printJob, setPrintJob };
}
