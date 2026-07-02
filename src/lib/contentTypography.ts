/**
 * Content typography shared by the editor (.ProseMirror, injected by
 * editor/contentStyles.ts) and the print/PDF pipeline (.print-content, via
 * pdf.ts buildPrintCss) — the single source for every metric that drives
 * vertical fill: font sizes, line heights, block gaps, paddings, margins.
 *
 * This is what keeps the editor's real page breaks (editor/PageBreaks.ts)
 * and paged.js's PDF pagination convergent: same geometry (pageGeometry.ts)
 * + same typography here => both engines break at the same points. Before
 * this module the two sides were hand-mirrored CSS blocks and had already
 * drifted (line-height 1.7 vs 1.5 = a 6-page document printing as 5; table
 * cell padding 6/10 vs 4/8; caption margins) — see plano.md 12.2 item 5.
 *
 * Colors, borders' colors and decorations stay per side (the editor themes
 * with CSS variables, print is fixed black-on-white): only metric
 * properties belong here. Border WIDTHS are metrics (they add height), so
 * width/style live here and each side sets border-*-color.
 */
export function contentTypographyCss(scope: string): string {
  return `
    ${scope} { font-size: 16px; line-height: 1.7; overflow-wrap: anywhere; }
    ${scope} > * + * { margin-top: 0.75em; }
    ${scope} h1 { font-size: 1.9em; line-height: 1.25; margin-top: 1.2em; }
    ${scope} h2 { font-size: 1.5em; margin-top: 1.1em; }
    ${scope} h3 { font-size: 1.2em; margin-top: 1em; }
    ${scope} ul, ${scope} ol { padding-left: 1.4em; }
    ${scope} blockquote { margin-left: 0; padding-left: 1em; }
    ${scope} code { font-size: 0.9em; font-family: "Cascadia Code", Consolas, monospace; padding: 0.15em 0.35em; }
    ${scope} pre { padding: 14px 16px; overflow-x: auto; }
    ${scope} pre code { padding: 0; }
    ${scope} img { display: block; max-width: 100%; height: auto; margin: 0.5em 0; }
    ${scope} table { border-collapse: collapse; width: 100%; margin: 0.75em 0; table-layout: fixed; }
    ${scope} th, ${scope} td { border-width: 1px; border-style: solid; padding: 6px 10px; vertical-align: top; }
    ${scope} p[data-caption] { font-size: 0.88em; text-align: center; margin: 4px 0 16px; }
    ${scope} .footnotes { margin-top: 2em; padding-top: 0.6em; border-top-width: 1px; border-top-style: solid; font-size: 0.85em; }
  `;
}
