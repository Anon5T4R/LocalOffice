import { CommandProps, Extension } from "@tiptap/core";

export interface IndentOptions {
  types: string[];
  /** One block-indent step, in cm (ABNT long quote = 4cm ≈ 3 steps + margin). */
  stepCm: number;
  maxSteps: number;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    indent: {
      /** First-line indent (e.g. "1.25cm" for ABNT); null removes it. */
      setTextIndent: (indent: string | null) => ReturnType;
      /** Shift the block indent by ±1 step. */
      changeIndent: (delta: 1 | -1) => ReturnType;
    };
  }
}

/**
 * Paragraph indentation: `textIndent` (first line) and `indent` (whole block,
 * counted in steps of `stepCm`). Both serialize as inline styles, so they
 * survive .html files and print/DOCX export, and degrade in Markdown — the
 * same line the LineHeight extension draws.
 */
export const Indent = Extension.create<IndentOptions>({
  name: "indent",

  addOptions() {
    return { types: ["paragraph", "heading"], stepCm: 1.25, maxSteps: 8 };
  },

  addGlobalAttributes() {
    const { stepCm } = this.options;
    return [
      {
        types: this.options.types,
        attributes: {
          textIndent: {
            default: null,
            parseHTML: (el) => el.style.textIndent || null,
            renderHTML: (attrs) =>
              attrs.textIndent ? { style: `text-indent: ${attrs.textIndent}` } : {},
          },
          indent: {
            default: 0,
            parseHTML: (el) => {
              const cm = parseFloat(el.style.marginLeft || "0");
              return el.style.marginLeft?.endsWith("cm") && cm > 0 ? Math.round(cm / stepCm) : 0;
            },
            renderHTML: (attrs) =>
              attrs.indent > 0 ? { style: `margin-left: ${attrs.indent * stepCm}cm` } : {},
          },
        },
      },
    ];
  },

  addCommands() {
    // One transaction via the command's own `tr` (single undo step, and safe
    // to call directly or inside chains — nested chains inside a command blow
    // up with "mismatched transaction").
    const apply =
      (types: string[], change: (attrs: Record<string, unknown>) => Record<string, unknown> | null) =>
      ({ tr, state, dispatch }: CommandProps) => {
        const { from, to } = state.selection;
        let changed = false;
        state.doc.nodesBetween(from, to, (node, pos) => {
          if (!types.includes(node.type.name)) return;
          const patch = change(node.attrs);
          if (patch) {
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...patch });
            changed = true;
          }
        });
        if (changed && dispatch) dispatch(tr);
        return changed;
      };

    return {
      setTextIndent: (indent: string | null) =>
        apply(this.options.types, () => ({ textIndent: indent })),
      changeIndent: (delta: 1 | -1) =>
        apply(this.options.types, (attrs) => {
          const current = Number(attrs.indent) || 0;
          const next = Math.max(0, Math.min(this.options.maxSteps, current + delta));
          return next === current ? null : { indent: next };
        }),
    };
  },

  addKeyboardShortcuts() {
    // Word's shortcuts; Tab stays with lists/tables.
    return {
      "Mod-]": () => this.editor.commands.changeIndent(1),
      "Mod-[": () => this.editor.commands.changeIndent(-1),
    };
  },
});
