import { createContext, useContext, type ReactNode } from "react";
import type { Editor } from "@tiptap/react";

const EditorCtx = createContext<Editor | null>(null);

/**
 * Children only mount once the editor exists — the `{editor && …}` guards
 * that used to pepper the App JSX live here, once.
 */
export function EditorProvider({ editor, children }: { editor: Editor | null; children: ReactNode }) {
  if (!editor) return null;
  return <EditorCtx.Provider value={editor}>{children}</EditorCtx.Provider>;
}

/** The live editor, guaranteed non-null (the provider gates the subtree). */
export function useEditorInstance(): Editor {
  const editor = useContext(EditorCtx);
  if (!editor) throw new Error("useEditorInstance deve ser usado dentro de <EditorProvider>");
  return editor;
}
