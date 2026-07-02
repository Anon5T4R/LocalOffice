import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    headingNumbers: {
      /** Turn automatic heading numbering (1, 1.1, 1.1.1…) on or off. */
      setHeadingNumbers: (enabled: boolean) => ReturnType;
    };
  }
}

const key = new PluginKey<{ enabled: boolean }>("headingNumbers");

/**
 * Advance the running counter for a heading of `level` and return its label.
 * Shared by the editor decorations and the print/export baking so both always
 * produce identical numbers.
 */
export function advanceHeadingCounter(counters: number[], level: number): string {
  counters[level - 1]++;
  for (let i = level; i < counters.length; i++) counters[i] = 0;
  return counters.slice(0, level).join(".");
}

/** Fresh counter state for a document walk (h1–h6). */
export function newHeadingCounters(): number[] {
  return [0, 0, 0, 0, 0, 0];
}

function buildDecorations(doc: PMNode): DecorationSet {
  const decorations: Decoration[] = [];
  const counters = newHeadingCounters();
  doc.descendants((node, pos) => {
    if (node.type.name === "footnotes") return false;
    if (node.type.name !== "heading") return true;
    const label = advanceHeadingCounter(counters, node.attrs.level);
    decorations.push(
      Decoration.widget(
        pos + 1,
        () => {
          const span = document.createElement("span");
          span.className = "heading-num";
          span.textContent = `${label} `;
          return span;
        },
        { side: -1 }
      )
    );
    return false; // headings contain no nested headings
  });
  return DecorationSet.create(doc, decorations);
}

/**
 * Automatic heading numbering as widget decorations: the numbers are computed
 * on every render and never live in the document, so reordering or deleting
 * sections can't desynchronize them. Print/export bakes the same numbers into
 * text (see preparePrintHtml) because decorations don't serialize.
 */
export const HeadingNumbers = Extension.create({
  name: "headingNumbers",

  addCommands() {
    return {
      setHeadingNumbers:
        (enabled: boolean) =>
        ({ tr, dispatch }) => {
          if (dispatch) dispatch(tr.setMeta(key, enabled));
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key,
        state: {
          init: () => ({ enabled: false }),
          apply: (tr, prev) => {
            const meta = tr.getMeta(key) as boolean | undefined;
            return meta === undefined ? prev : { enabled: meta };
          },
        },
        props: {
          decorations(state) {
            return key.getState(state)?.enabled ? buildDecorations(state.doc) : null;
          },
        },
      }),
    ];
  },
});
