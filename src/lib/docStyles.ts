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
}

export const STYLE_TARGETS: { key: keyof DocStyles; label: string }[] = [
  { key: "paragraph", label: "Parágrafo" },
  { key: "h1", label: "Título 1" },
  { key: "h2", label: "Título 2" },
  { key: "h3", label: "Título 3" },
  { key: "blockquote", label: "Citação" },
  { key: "caption", label: "Legenda" },
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

/** CSS for the document's style overrides, or "" when there are none. */
export function docStylesCss(scope: string, styles: DocStyles | null | undefined): string {
  if (!styles) return "";
  const rules: string[] = [];
  for (const { key } of STYLE_TARGETS) {
    const s = styles[key];
    if (!s) continue;
    const decl = declarations(s);
    if (decl) rules.push(`${selectorFor(scope, key)} { ${decl} }`);
  }
  return rules.join("\n");
}
