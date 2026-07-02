import { Extension, Node, mergeAttributes } from "@tiptap/core";
import { NodeViewProps, NodeViewWrapper, ReactNodeViewRenderer, useEditorState } from "@tiptap/react";
import type { Node as PMNode } from "@tiptap/pm/model";
import { advanceHeadingCounter, newHeadingCounters } from "./HeadingNumbers";
import { CAPTION_LABELS, captionKindOf } from "../lib/captionNumbers";
import { newId } from "../lib/id";
import { revealPos } from "./reveal";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    crossref: {
      /**
       * Insert a cross-reference to the target at `pos` (a heading or a
       * caption). Assigns the target a persistent refId when it lacks one.
       */
      insertCrossRef: (pos: number) => ReturnType;
    };
  }
}

/** A referenceable node (heading or caption) found in the document. */
export interface CrossRefTarget {
  pos: number;
  /** "Seção 1.2", "Figura 3", … */
  label: string;
  /** The node's own text, for the picker list. */
  text: string;
}

/**
 * Walk the doc computing the same numbering the decorations show. Both the
 * picker list and the live resolution below share this walk so a reference
 * can never disagree with the number printed next to its target.
 */
function walkTargets(doc: PMNode, visit: (t: CrossRefTarget & { refId: string | null }) => boolean | void): void {
  const counters = newHeadingCounters();
  const counts: Record<"figure" | "table", number> = { figure: 0, table: 0 };
  let stop = false;
  doc.descendants((node, pos) => {
    if (stop) return false;
    if (node.type.name === "footnotes") return false;
    if (node.type.name === "heading") {
      const label = `Seção ${advanceHeadingCounter(counters, node.attrs.level)}`;
      stop = visit({ pos, label, text: node.textContent, refId: node.attrs.refId ?? null }) === true;
      return false;
    }
    if (node.type.name === "caption") {
      const kind = captionKindOf(node.attrs.kind);
      const label = `${CAPTION_LABELS[kind]} ${++counts[kind]}`;
      stop = visit({ pos, label, text: node.textContent, refId: node.attrs.refId ?? null }) === true;
      return false;
    }
    return true;
  });
}

/** Every referenceable target, in document order (for the picker). */
export function listCrossRefTargets(doc: PMNode): CrossRefTarget[] {
  const out: CrossRefTarget[] = [];
  walkTargets(doc, (t) => {
    out.push({ pos: t.pos, label: t.label, text: t.text });
  });
  return out;
}

/** Resolve a refId to its current label/position, or null if the target is gone. */
export function resolveCrossRef(doc: PMNode, refId: string): { label: string; pos: number } | null {
  if (!refId) return null;
  let found: { label: string; pos: number } | null = null;
  walkTargets(doc, (t) => {
    if (t.refId !== refId) return;
    found = { label: t.label, pos: t.pos };
    return true;
  });
  return found;
}

/**
 * Gives headings and captions a persistent `refId` (data-ref-id), assigned
 * lazily when the first reference to them is created.
 */
export const CrossRefTargets = Extension.create({
  name: "crossRefTargets",

  addGlobalAttributes() {
    return [
      {
        types: ["heading", "caption"],
        attributes: {
          refId: {
            default: null,
            parseHTML: (el) => el.getAttribute("data-ref-id"),
            renderHTML: (attrs) => (attrs.refId ? { "data-ref-id": attrs.refId } : {}),
          },
        },
      },
    ];
  },
});

/**
 * Inline cross-reference ("Figura 3", "Seção 1.2"). The node stores only the
 * target's refId; the visible text is always resolved live from the document,
 * so renumbering or moving the target can never leave a stale reference.
 */
function CrossRefView({ node, editor }: NodeViewProps) {
  const target = String(node.attrs.target ?? "");
  const resolved = useEditorState({
    editor,
    selector: ({ editor }) => resolveCrossRef(editor.state.doc, target),
    equalityFn: (a, b) => a?.label === b?.label && a?.pos === b?.pos,
  });

  return (
    <NodeViewWrapper
      as="span"
      className={"crossref" + (resolved ? "" : " crossref-missing")}
      title={resolved ? "Referência cruzada — clique para ir ao alvo" : "Alvo da referência não existe mais"}
      onClick={resolved ? () => revealPos(editor, resolved.pos) : undefined}
    >
      {resolved?.label ?? "ref?"}
    </NodeViewWrapper>
  );
}

export const CrossRef = Node.create({
  name: "crossref",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      target: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-crossref") ?? "",
        renderHTML: (attrs) => ({ "data-crossref": attrs.target }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-crossref]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CrossRefView);
  },

  addCommands() {
    return {
      insertCrossRef:
        (pos: number) =>
        ({ state, chain }) => {
          const target = state.doc.nodeAt(pos);
          if (!target || (target.type.name !== "heading" && target.type.name !== "caption")) {
            return false;
          }
          const refId: string = target.attrs.refId ?? newId("ref-");
          return chain()
            .command(({ tr }) => {
              if (!target.attrs.refId) {
                tr.setNodeMarkup(pos, undefined, { ...target.attrs, refId });
              }
              return true;
            })
            .insertContent({ type: this.name, attrs: { target: refId } })
            .run();
        },
    };
  },
});
