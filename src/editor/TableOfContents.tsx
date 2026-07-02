import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditorState,
} from "@tiptap/react";
import { revealPos } from "./reveal";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    tableOfContents: {
      /** Insert a table-of-contents block at the cursor. */
      insertTableOfContents: () => ReturnType;
    };
  }
}

interface TocEntry {
  level: number;
  text: string;
  pos: number;
}

/**
 * Live view of the document's headings, for navigation. The node itself stores
 * nothing — the entries are recomputed from the doc, and the print pipeline
 * regenerates the final list with heading numbers and real page numbers
 * (target-counter) at export time.
 */
function TocView({ editor }: NodeViewProps) {
  const entries = useEditorState({
    editor,
    selector: ({ editor }): TocEntry[] => {
      const out: TocEntry[] = [];
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === "footnotes") return false;
        if (node.type.name !== "heading") return true;
        out.push({
          level: node.attrs.level,
          text: node.textContent || "(sem título)",
          pos,
        });
        return false;
      });
      return out;
    },
    equalityFn: (a, b) => JSON.stringify(a) === JSON.stringify(b),
  })!;

  const go = (pos: number) => revealPos(editor, pos);

  return (
    <NodeViewWrapper className="toc-block" data-toc="" contentEditable={false}>
      <div className="toc-header">Sumário</div>
      {entries.length === 0 && <div className="toc-empty">Os títulos do documento aparecem aqui.</div>}
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

  parseHTML() {
    return [{ tag: "nav[data-toc]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["nav", mergeAttributes(HTMLAttributes, { "data-toc": "" })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TocView);
  },

  addCommands() {
    return {
      insertTableOfContents:
        () =>
        ({ chain }) =>
          chain().insertContent({ type: this.name }).run(),
    };
  },
});
