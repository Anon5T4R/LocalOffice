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

const TOC_TITLES: Record<TocKind, string> = {
  headings: "Sumário",
  figures: "Lista de Figuras",
  tables: "Lista de Tabelas",
};

const TOC_EMPTY: Record<TocKind, string> = {
  headings: "Os títulos do documento aparecem aqui.",
  figures: "As legendas de figura aparecem aqui.",
  tables: "As legendas de tabela aparecem aqui.",
};

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
          out.push({ level: n.attrs.level, text: n.textContent || "(sem título)", pos });
          return false;
        }
        if (n.type.name !== "caption") return true;
        if (captionKindOf(n.attrs.kind) !== wantCaption) return false;
        counter++;
        const label = `${CAPTION_LABELS[wantCaption]} ${counter}`;
        out.push({ level: 1, text: `${label} — ${n.textContent || "(sem legenda)"}`, pos });
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
      {entries.length === 0 && <div className="toc-empty">{TOC_EMPTY[kind]}</div>}
      {entries.map((e, i) => (
        <button key={i} className={`toc-entry lvl-${e.level}`} onClick={() => go(e.pos)} title={e.text}>
          <span className="toc-title">{e.text}</span>
        </button>
      ))}
      {entries.length > 0 && (
        <div className="toc-hint">Números de página são adicionados na impressão/PDF.</div>
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
