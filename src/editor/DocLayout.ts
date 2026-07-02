import { Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/react";
import { EMPTY_HEADER_FOOTER, type HeaderFooterSpec, type PageFormat, type PageMargins, type Settings } from "../lib/settings";
import { DEFAULT_MARGINS } from "../lib/pageGeometry";

/**
 * Page/print layout for one document: format, margins, header/footer,
 * automatic heading numbers. Lives as an attribute of the ProseMirror `doc`
 * node (not in Settings) for two reasons: (1) it travels with the document —
 * opening the same file elsewhere renders with the same layout; (2) it's
 * undoable — Ctrl+Z reverts a margin/format change through the normal
 * document history, because setting it is a real transaction.
 */
export interface DocLayout {
  pageFormat: PageFormat;
  pageMargins: PageMargins;
  pageHeader: HeaderFooterSpec;
  pageFooter: HeaderFooterSpec;
  pageChromeOnFirst: boolean;
  numberHeadings: boolean;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    docLayout: {
      /**
       * Replace the document's layout outright. Callers merge their patch
       * onto `effectiveLayout()` themselves (below) so a document that never
       * had layout attrs of its own captures the full, currently-effective
       * layout the first time it's touched, instead of a partial object
       * with holes.
       */
      setDocLayout: (layout: DocLayout) => ReturnType;
    };
  }
}

/** The app-wide Settings, shaped as a DocLayout — used as the fallback. */
export function settingsLayout(settings: Settings): DocLayout {
  return {
    pageFormat: settings.pageFormat || "classic",
    pageMargins: settings.pageMargins || DEFAULT_MARGINS,
    pageHeader: settings.pageHeader || EMPTY_HEADER_FOOTER,
    pageFooter: settings.pageFooter || { ...EMPTY_HEADER_FOOTER, center: "{page}" },
    pageChromeOnFirst: settings.pageChromeOnFirst !== false,
    numberHeadings: settings.numberHeadings === true,
  };
}

/**
 * The layout in effect for `doc`: its own attrs if it's ever been set
 * (including by opening a file that carried one — see lib/document.ts),
 * otherwise the app-wide Settings. This is how documents created or opened
 * before this feature existed keep behaving exactly as before, until the
 * user changes their layout for the first time.
 */
export function effectiveLayout(doc: PMNode, settings: Settings): DocLayout {
  return (doc.attrs.layout as DocLayout | null | undefined) ?? settingsLayout(settings);
}

/** Same as `effectiveLayout`, tolerant of the editor not existing yet. */
export function effectiveLayoutFor(editor: Editor | null, settings: Settings): DocLayout {
  return editor ? effectiveLayout(editor.state.doc, settings) : settingsLayout(settings);
}

/** Merge `patch` onto the document's effective layout and commit it. */
export function patchDocLayout(editor: Editor, settings: Settings, patch: Partial<DocLayout>): void {
  editor.commands.setDocLayout({ ...effectiveLayout(editor.state.doc, settings), ...patch });
}

export const DocLayoutExtension = Extension.create({
  name: "docLayout",

  addGlobalAttributes() {
    return [
      {
        types: ["doc"],
        attributes: {
          layout: {
            default: null,
            keepOnSplit: true,
            // Doc-level attrs aren't part of the HTML fragment the editor
            // parses/renders — lib/document.ts carries this as a leading
            // comment in .md/.html files instead (pandoc formats seed from
            // Settings on open; no round-trip there yet).
            parseHTML: () => null,
            renderHTML: () => ({}),
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setDocLayout:
        (layout: DocLayout) =>
        ({ tr, dispatch }) => {
          if (dispatch) dispatch(tr.setDocAttribute("layout", layout));
          return true;
        },
    };
  },
});
