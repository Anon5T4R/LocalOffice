import katex from "katex";
import "katex/dist/katex.min.css";

// KaTeX lives in its own lazy chunk: every consumer (the math NodeView, the
// print baking) reaches this module via dynamic import, so documents without
// equations never pay for it. The CSS import rides along in the same chunk.

/** Render one LaTeX string to KaTeX markup (never throws — errors show red). */
export function renderMathHtml(latex: string): string {
  return katex.renderToString(latex, {
    throwOnError: false,
    output: "htmlAndMathml",
  });
}

/**
 * Bake every math span in `doc` into static KaTeX markup, for print/PDF.
 * The editor renders math through a NodeView, which doesn't serialize —
 * without this step printed math would be raw LaTeX source. The `data-latex`
 * attribute stays on the wrapper, so the source is never lost.
 */
export function renderMathInto(doc: Document): void {
  doc.querySelectorAll("span[data-math]").forEach((el) => {
    const latex = el.getAttribute("data-latex") ?? el.textContent ?? "";
    if (latex.trim()) el.innerHTML = renderMathHtml(latex);
  });
}
