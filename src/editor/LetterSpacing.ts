import { Extension } from "@tiptap/core";

export interface LetterSpacingOptions {
  types: string[];
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    letterSpacing: {
      setLetterSpacing: (spacing: string) => ReturnType;
      unsetLetterSpacing: () => ReturnType;
    };
  }
}

export const LetterSpacing = Extension.create<LetterSpacingOptions>({
  name: "letterSpacing",

  addOptions() {
    return { types: ["textStyle"] };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          letterSpacing: {
            default: null,
            parseHTML: (el) => el.style.letterSpacing?.replace(/['"]+/g, "") ?? null,
            renderHTML: (attrs) => {
              if (!attrs.letterSpacing) return {};
              return { style: `letter-spacing: ${attrs.letterSpacing}` };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setLetterSpacing:
        (spacing: string) =>
        ({ chain }) =>
          chain().setMark("textStyle", { letterSpacing: spacing }).run(),
      unsetLetterSpacing:
        () =>
        ({ chain }) =>
          chain()
            .setMark("textStyle", { letterSpacing: null })
            .removeEmptyTextStyle()
            .run(),
    };
  },
});
