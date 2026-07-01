import { Extension } from "@tiptap/core";

export interface LineHeightOptions {
  types: string[];
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    lineHeight: {
      setLineHeight: (height: string) => ReturnType;
      unsetLineHeight: () => ReturnType;
    };
  }
}

export const LineHeight = Extension.create<LineHeightOptions>({
  name: "lineHeight",

  addOptions() {
    return { types: ["paragraph", "heading"] };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (el) => el.style.lineHeight?.replace(/['"]+/g, "") ?? null,
            renderHTML: (attrs) => {
              if (!attrs.lineHeight) return {};
              return { style: `line-height: ${attrs.lineHeight}` };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setLineHeight:
        (height: string) =>
        ({ editor }) => {
          const { from, to } = editor.state.selection;
          const doc = editor.state.doc;
          const ops: (() => boolean)[] = [];
          doc.nodesBetween(from, to, (node) => {
            if (this.options.types.includes(node.type.name)) {
              ops.push(() => editor.chain().updateAttributes(node.type.name, { lineHeight: height }).run());
            }
          });
          if (ops.length === 0) return false;
          return ops.every((fn) => fn());
        },
      unsetLineHeight:
        () =>
        ({ editor }) => {
          const { from, to } = editor.state.selection;
          const doc = editor.state.doc;
          const ops: (() => boolean)[] = [];
          doc.nodesBetween(from, to, (node) => {
            if (this.options.types.includes(node.type.name) && node.attrs.lineHeight) {
              ops.push(() => editor.chain().updateAttributes(node.type.name, { lineHeight: null }).run());
            }
          });
          if (ops.length === 0) return false;
          return ops.every((fn) => fn());
        },
    };
  },
});
