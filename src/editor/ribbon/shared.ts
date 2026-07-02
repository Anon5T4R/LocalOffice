import type { Editor } from "@tiptap/react";
import type { CustomFont, PageMargins } from "../../lib/settings";
import { DEFAULT_MARGINS } from "../../lib/pageGeometry";
import { shallowEqual } from "../../lib/equality";

/** Rewrite the case of the current selection's text, preserving each run's marks. */
export function transformCase(editor: Editor, fn: (s: string) => string): void {
  const { state } = editor;
  const { from, to, empty } = state.selection;
  if (empty) return;
  const { tr, schema, doc } = state;
  const jobs: { start: number; end: number; text: ReturnType<typeof schema.text> }[] = [];
  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText || node.text == null) return;
    const start = Math.max(pos, from);
    const end = Math.min(pos + node.text.length, to);
    if (start >= end) return;
    const slice = node.text.slice(start - pos, end - pos);
    const next = fn(slice);
    if (next !== slice) jobs.push({ start, end, text: schema.text(next, node.marks) });
  });
  // Apply back-to-front so earlier positions stay valid.
  for (let i = jobs.length - 1; i >= 0; i--) tr.replaceWith(jobs[i].start, jobs[i].end, jobs[i].text);
  if (tr.docChanged) editor.view.dispatch(tr);
  editor.commands.focus();
}

export const CASE_FNS: Record<string, (s: string) => string> = {
  upper: (s) => s.toLocaleUpperCase(),
  lower: (s) => s.toLocaleLowerCase(),
  title: (s) => s.toLocaleLowerCase().replace(/(^|\s|[-–—])(\S)/g, (_, sep, c) => sep + c.toLocaleUpperCase()),
};

export const MARGIN_PRESETS: Record<string, PageMargins> = {
  normal: DEFAULT_MARGINS,
  narrow: { top: 36, bottom: 36, left: 36, right: 36 },
  moderate: { top: 48, bottom: 48, left: 60, right: 60 },
  wide: { top: 72, bottom: 72, left: 96, right: 96 },
};

export function currentMarginPreset(m: PageMargins): string {
  for (const [key, val] of Object.entries(MARGIN_PRESETS)) {
    if (shallowEqual(m, val)) return key;
  }
  return "personalizado";
}

/** Imported fonts first, then generic families, then everything the OS has. */
export function buildFontList(customFonts: CustomFont[], systemFonts: string[]): string[] {
  return [
    ...customFonts.map((f) => f.name),
    "Sans-serif",
    "Serif",
    "Monospace",
    "Arial",
    "Times New Roman",
    "Courier New",
    "Georgia",
    "Verdana",
    ...systemFonts,
  ];
}
