/**
 * Named per-document styles ("Parágrafo", "Título 1"…): one definition per
 * block TYPE, cascading to every block of that type — the semantic-editor
 * equivalent of Word's named styles, minus per-block style assignment (the
 * block's type IS its style here).
 *
 * They live inside the document's layout attr (editor/DocLayout.ts), so they
 * travel with the file, undo like any edit, and reach the print pipeline
 * through the same channel as margins. The generated CSS is emitted AFTER
 * contentTypographyCss for both scopes (editor via editor/contentStyles.ts'
 * sibling tag updated in App.tsx; print via pdf.ts buildPrintCss), so the
 * overrides drive vertical fill identically on both sides — page breaks and
 * the PDF stay convergent under custom styles.
 */

export interface BlockStyle {
  /** Empty/undefined = inherit the app default. */
  fontFamily?: string;
  fontSizePx?: number;
  lineHeight?: number;
  align?: "left" | "center" | "right" | "justify";
  /** Space above the block, in em (overrides the shared 0.75em gap). */
  spacingBeforeEm?: number;
  /** First-line indent in cm (body paragraphs; ABNT uses 1.25). */
  firstLineIndentCm?: number;
}

export interface DocStyles {
  paragraph?: BlockStyle;
  h1?: BlockStyle;
  h2?: BlockStyle;
  h3?: BlockStyle;
  blockquote?: BlockStyle;
  caption?: BlockStyle;
  /** Generated blocks: Sumário/Listas (TOC) e Referências (bibliography).
   *  Their text is produced by NodeViews (editor) and baking (print), so the
   *  font marks a template applies to content never reach it — this style is
   *  the only channel that fonts it, on both sides. */
  generated?: BlockStyle;
}

export const STYLE_TARGETS: { key: keyof DocStyles; label: string }[] = [
  { key: "paragraph", label: "Parágrafo" },
  { key: "h1", label: "Título 1" },
  { key: "h2", label: "Título 2" },
  { key: "h3", label: "Título 3" },
  { key: "blockquote", label: "Citação" },
  { key: "caption", label: "Legenda" },
  { key: "generated", label: "Sumário/Referências" },
];

/** Containers of generated text: editor NodeViews / print-baked sections. */
const GENERATED_BLOCKS = [".toc-block", "nav.toc", ".bibliography-block", "section.bibliography"];
/** Their titles ("Sumário", "Lista de Figuras/Tabelas", "Referências"),
 *  parent-qualified so these rules outrank the base 1.1em/1.4em title rules
 *  (App.css / pdf.ts print CSS) regardless of stylesheet order. */
const GENERATED_TITLES = [
  ".toc-block .toc-header",
  "nav.toc .toc-header",
  ".bibliography-block .bibliography-header",
  "section.bibliography .bibliography-header",
];

function selectorFor(scope: string, key: keyof DocStyles): string {
  switch (key) {
    // Captions are <p data-caption> — keep body-paragraph styling off them.
    case "paragraph":
      return `${scope} p:not([data-caption])`;
    case "caption":
      return `${scope} p[data-caption]`;
    case "blockquote":
      return `${scope} blockquote`;
    default:
      return `${scope} ${key}`;
  }
}

function declarations(s: BlockStyle): string {
  const out: string[] = [];
  if (s.fontFamily) out.push(`font-family: ${s.fontFamily};`);
  if (s.fontSizePx) out.push(`font-size: ${s.fontSizePx}px;`);
  if (s.lineHeight) out.push(`line-height: ${s.lineHeight};`);
  if (s.align) out.push(`text-align: ${s.align};`);
  if (s.spacingBeforeEm !== undefined) out.push(`margin-top: ${s.spacingBeforeEm}em;`);
  if (s.firstLineIndentCm !== undefined) out.push(`text-indent: ${s.firstLineIndentCm}cm;`);
  return out.join(" ");
}

/** The "generated" style needs two grains: the font metrics cascade over the
 *  whole block (entries included — TOC lines, csl-entry references), while the
 *  full style (alignment, spacing) hits only the titles, replacing their
 *  relative base size with the exact value. */
function generatedCss(scope: string, s: BlockStyle): string {
  const font: string[] = [];
  if (s.fontFamily) font.push(`font-family: ${s.fontFamily};`);
  if (s.fontSizePx) font.push(`font-size: ${s.fontSizePx}px;`);
  if (s.lineHeight) font.push(`line-height: ${s.lineHeight};`);
  const rules: string[] = [];
  if (font.length)
    rules.push(`${GENERATED_BLOCKS.map((b) => `${scope} ${b}`).join(", ")} { ${font.join(" ")} }`);
  const decl = declarations(s);
  if (decl) rules.push(`${GENERATED_TITLES.map((t) => `${scope} ${t}`).join(", ")} { ${decl} }`);
  return rules.join("\n");
}

/** CSS for the document's style overrides, or "" when there are none. */
export function docStylesCss(scope: string, styles: DocStyles | null | undefined): string {
  if (!styles) return "";
  const rules: string[] = [];
  for (const { key } of STYLE_TARGETS) {
    const s = styles[key];
    if (!s) continue;
    if (key === "generated") {
      const css = generatedCss(scope, s);
      if (css) rules.push(css);
      continue;
    }
    const decl = declarations(s);
    if (decl) rules.push(`${selectorFor(scope, key)} { ${decl} }`);
  }
  return rules.join("\n");
}
