import { Node, mergeAttributes } from "@tiptap/core";
import { NodeSelection, Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";
import { CAPTION_LABELS, captionKindOf, type CaptionKind } from "../lib/captionNumbers";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    caption: {
      /**
       * Insert a caption below the selected image/table (falls back to the
       * cursor's block). Kind is inferred from the selection when omitted.
       */
      insertCaption: (kind?: CaptionKind) => ReturnType;
    };
  }
}

const numberingKey = new PluginKey("captionNumbers");

function buildDecorations(doc: PMNode): DecorationSet {
  const decorations: Decoration[] = [];
  const counts: Record<CaptionKind, number> = { figure: 0, table: 0 };
  doc.descendants((node, pos) => {
    if (node.type.name === "footnotes") return false;
    if (node.type.name !== "caption") return true;
    const kind = captionKindOf(node.attrs.kind);
    const label = `${CAPTION_LABELS[kind]} ${++counts[kind]}`;
    decorations.push(
      Decoration.widget(
        pos + 1,
        () => {
          const span = document.createElement("span");
          span.className = "caption-num";
          span.textContent = `${label} — `;
          return span;
        },
        { side: -1 }
      )
    );
    return false;
  });
  return DecorationSet.create(doc, decorations);
}

/**
 * Figure/table caption: a paragraph-like block whose number ("Figura 3 — ")
 * is a decoration computed from document order — reordering or deleting
 * figures can never desynchronize the numbers. Print/export bakes the same
 * numbers into text (lib/captionNumbers.ts) because decorations don't
 * serialize.
 */
export const Caption = Node.create({
  name: "caption",
  group: "block",
  content: "inline*",

  addAttributes() {
    return {
      kind: {
        default: "figure",
        parseHTML: (el) => captionKindOf(el.getAttribute("data-caption")),
        renderHTML: (attrs) => ({ "data-caption": attrs.kind }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "p[data-caption]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["p", mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      insertCaption:
        (kind?: CaptionKind) =>
        ({ state, chain }) => {
          const { selection } = state;
          const $from = selection.$from;

          // Enclosing table (cursor inside a cell)?
          let tableEnd: number | null = null;
          for (let d = $from.depth; d > 0; d--) {
            if ($from.node(d).type.name === "table") {
              tableEnd = $from.after(d);
              break;
            }
          }
          const isImage =
            selection instanceof NodeSelection && selection.node.type.name === "image";

          const resolvedKind: CaptionKind = kind ?? (tableEnd !== null ? "table" : "figure");
          const insertAt =
            tableEnd ?? (isImage ? selection.to : $from.depth > 0 ? $from.after(1) : selection.to);

          return chain()
            .insertContentAt(insertAt, { type: this.name, attrs: { kind: resolvedKind } })
            .setTextSelection(insertAt + 1)
            .run();
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: numberingKey,
        state: {
          init: (_config, state) => buildDecorations(state.doc),
          apply: (tr, old) => (tr.docChanged ? buildDecorations(tr.doc) : old),
        },
        props: {
          decorations(state) {
            return numberingKey.getState(state);
          },
        },
      }),
    ];
  },
});
