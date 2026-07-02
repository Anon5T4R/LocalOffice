import { generateHTML } from "@tiptap/core";
import type { Editor } from "@tiptap/react";
import { buildExtensions } from "../editor/extensions";
import type { DocLayout } from "../editor/DocLayout";
import type { Tab } from "./tabs";

/**
 * HTML and layout for a tab regardless of whether it's the one currently
 * live in the editor. The active tab's content only exists inside the
 * editor instance; inactive tabs keep their up-to-date content — including
 * the doc-level `layout` attribute (see editor/DocLayout.ts) — as
 * ProseMirror JSON in `doc` (see useDocumentTabs), which this renders
 * through the same extension set the editor uses.
 */
export function contentForTab(
  tab: Tab,
  activeId: string,
  editor: Editor | null
): { html: string; layout: DocLayout | null } {
  if (tab.id === activeId && editor) {
    return { html: editor.getHTML(), layout: (editor.state.doc.attrs.layout as DocLayout | null) ?? null };
  }
  return { html: generateHTML(tab.doc, buildExtensions()), layout: (tab.doc.attrs?.layout as DocLayout | null) ?? null };
}
