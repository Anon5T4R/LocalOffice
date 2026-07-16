import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditorState,
} from "@tiptap/react";
import { revealPos } from "./reveal";
import { arrayOfObjectsEqual } from "../lib/equality";
import { CAPTION_LABELS, captionKindOf } from "../lib/captionNumbers";
import { t } from "../lib/i18n";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    tableOfContents: {
      /** Insert a table-of-contents block at the cursor. */
      insertTableOfContents: (kind?: TocKind) => ReturnType;
    };
  }
}

/** What the block lists: document headings, figure captions or table captions. */
export type TocKind = "headings" | "figures" | "tables";

// TOC_TITLES é CONTEÚDO do documento (norma acadêmica) e precisa bater com o que
// o export/PDF gera — fica em pt, NÃO segue o idioma da UI (ver lib/pdf.ts e
// lib/exportPrep.ts, que geram os mesmos rótulos).
const TOC_TITLES: Record<TocKind, string> = {
  headings: "Sumário",
  figures: "Lista de Figuras",
  tables: "Lista de Tabelas",
};

// Chrome do editor (não vai pro documento) → segue o idioma da UI.
function tocEmpty(kind: TocKind): string {
  return kind === "figures"
    ? t("toc.emptyFigures")
    : kind === "tables"
      ? t("toc.emptyTables")
      : t("toc.emptyHeadings");
}

function tocKindOf(value: string | null): TocKind {
  return value === "figures" || value === "tables" ? value : "headings";
}

interface TocEntry {
  level: number;
  text: string;
  pos: number;
}

/**
 * Live view of the document's headings (or figure/table captions), for
 * navigation. The node itself stores nothing beyond the kind — the entries
 * are recomputed from the doc, and the print pipeline regenerates the final
 * list with numbers and real page numbers (target-counter) at export time.
 */
function TocView({ editor, node }: NodeViewProps) {
  const kind = tocKindOf(node.attrs.kind);
  const wantCaption = kind === "figures" ? "figure" : "table";

  const entries = useEditorState({
    editor,
    selector: ({ editor }): TocEntry[] => {
      const out: TocEntry[] = [];
      let counter = 0;
      editor.state.doc.descendants((n, pos) => {
        if (n.type.name === "footnotes") return false;
        if (kind === "headings") {
          if (n.type.name !== "heading") return true;
          out.push({ level: n.attrs.level, text: n.textContent || t("toc.untitled"), pos });
          return false;
        }
        if (n.type.name !== "caption") return true;
        if (captionKindOf(n.attrs.kind) !== wantCaption) return false;
        counter++;
        const label = `${CAPTION_LABELS[wantCaption]} ${counter}`;
        out.push({ level: 1, text: `${label} — ${n.textContent || t("toc.noCaption")}`, pos });
        return false;
      });
      return out;
    },
    equalityFn: arrayOfObjectsEqual,
  });

  const go = (pos: number) => revealPos(editor, pos);

  return (
    <NodeViewWrapper className="toc-block" data-toc={kind === "headings" ? "" : kind} contentEditable={false}>
      <div className="toc-header">{TOC_TITLES[kind]}</div>
      {entries.length === 0 && <div className="toc-empty">{tocEmpty(kind)}</div>}
      {entries.map((e, i) => (
        <button key={i} className={`toc-entry lvl-${e.level}`} onClick={() => go(e.pos)} title={e.text}>
          <span className="toc-title">{e.text}</span>
        </button>
      ))}
      {entries.length > 0 && (
        <div className="toc-hint">{t("toc.hint")}</div>
      )}
    </NodeViewWrapper>
  );
}

export const TableOfContents = Node.create({
  name: "tableOfContents",
  group: "block",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      kind: {
        default: "headings",
        parseHTML: (el) => tocKindOf(el.getAttribute("data-toc")),
        // data-toc="" keeps the historical form for plain summaries, so old
        // documents round-trip unchanged.
        renderHTML: (attrs) => ({ "data-toc": attrs.kind === "headings" ? "" : attrs.kind }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "nav[data-toc]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["nav", mergeAttributes(HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TocView);
  },

  addCommands() {
    return {
      insertTableOfContents:
        (kind: TocKind = "headings") =>
        ({ chain }) =>
          chain().insertContent({ type: this.name, attrs: { kind } }).run(),
    };
  },
});
