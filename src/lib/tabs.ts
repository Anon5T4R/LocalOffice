import type { JSONContent } from "@tiptap/core";
import { DocFormat, baseName } from "./document";

export interface Tab {
  id: string;
  filePath: string | null;
  format: DocFormat;
  dirty: boolean;
  /** ProseMirror JSON — source of truth for inactive tabs. */
  doc: JSONContent;
}

export const EMPTY_DOC: JSONContent = { type: "doc", content: [{ type: "paragraph" }] };

/** State of the tab-save pipeline (autosave and manual), shown in the status bar. */
export type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  | { kind: "error"; message: string; at: number };

let counter = 0;
export function newTab(partial: Partial<Tab> = {}): Tab {
  counter += 1;
  return {
    id: `tab-${Date.now()}-${counter}`,
    filePath: null,
    format: "markdown",
    dirty: false,
    doc: EMPTY_DOC,
    ...partial,
  };
}

export function tabTitle(tab: Tab): string {
  return tab.filePath ? baseName(tab.filePath) : "sem título";
}
