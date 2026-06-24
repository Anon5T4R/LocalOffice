import { Node, mergeAttributes } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pageBreak: {
      setPageBreak: () => ReturnType;
    };
  }
}

/**
 * Manual page break. Keeps the editor in free-flow, but marks an explicit page
 * boundary that becomes a real `break-after: page` in the PDF/print export.
 */
export const PageBreak = Node.create({
  name: "pageBreak",
  group: "block",
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: "div[data-page-break]" }, { tag: 'hr[data-page-break="true"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-page-break": "true", class: "page-break" }),
      ["span", { class: "page-break-label", contenteditable: "false" }, "Quebra de página"],
    ];
  },

  addCommands() {
    return {
      setPageBreak:
        () =>
        ({ chain }) =>
          chain().insertContent({ type: this.name }).run(),
    };
  },
});
