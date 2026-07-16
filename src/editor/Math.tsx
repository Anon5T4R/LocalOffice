import { useEffect, useState } from "react";
import { Node, mergeAttributes, nodeInputRule } from "@tiptap/core";
import { NodeViewProps, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import { t } from "../lib/i18n";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    math: {
      /** Insert an inline equation; prompts for LaTeX when none is given. */
      insertMath: (latex?: string) => ReturnType;
    };
  }
}

/**
 * Inline equation. The node stores only the LaTeX source (`latex` attr); the
 * visible formula is produced by KaTeX at render time, lazy-loaded so
 * documents without math never pay for the library.
 */
function MathView({ node, updateAttributes, editor }: NodeViewProps) {
  const latex = String(node.attrs.latex ?? "");
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    import("../lib/mathRender").then(({ renderMathHtml }) => {
      if (alive) setHtml(renderMathHtml(latex));
    });
    return () => {
      alive = false;
    };
  }, [latex]);

  const edit = () => {
    if (!editor.isEditable) return;
    const next = window.prompt(t("math.promptEdit"), latex);
    if (next !== null && next.trim()) updateAttributes({ latex: next.trim() });
  };

  return (
    <NodeViewWrapper
      as="span"
      className="math-inline"
      title={t("math.editTitle")}
      onDoubleClick={edit}
    >
      {html ? (
        <span dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <code>{latex || "…"}</code>
      )}
    </NodeViewWrapper>
  );
}

export const MathInline = Node.create({
  name: "math",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      latex: {
        default: "",
        // data-latex is authoritative; textContent is the fallback for spans
        // hand-written without the attribute.
        parseHTML: (el) => el.getAttribute("data-latex") ?? el.textContent ?? "",
        renderHTML: (attrs) => ({ "data-latex": attrs.latex }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-math]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    // The LaTeX source doubles as the span's text, so a plain HTML reader
    // (browser, pandoc) still sees the formula source instead of nothing.
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-math": "" }),
      String(node.attrs.latex ?? ""),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathView);
  },

  addCommands() {
    return {
      insertMath:
        (latex?: string) =>
        ({ chain }) => {
          const source = latex ?? window.prompt(t("math.promptEdit"), "") ?? "";
          if (!source.trim()) return false;
          return chain()
            .insertContent({ type: this.name, attrs: { latex: source.trim() } })
            .run();
        },
    };
  },

  addInputRules() {
    return [
      // Typing $...$ converts to an equation. Guards against currency: the
      // content can't start/end with whitespace and must contain something
      // that isn't digits/punctuation, so "custa $50 e $60$" stays text.
      nodeInputRule({
        find: /\$(?=[^$\n]*[^\d\s.,$])([^\s$](?:[^$\n]*[^\s$])?)\$$/,
        type: this.type,
        getAttributes: (match) => ({ latex: match[1].trim() }),
      }),
    ];
  },
});
