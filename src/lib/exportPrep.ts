// Prep shared by every pandoc export (docx/odt/rtf): editor markup that only
// the app understands must become something a Word/Writer user actually sees.
// Discovered testing a real multi-page doc in ONLYOFFICE (jul/2026): the
// page-break LABEL exported as literal text "Quebra de página", the TOC nav
// vanished, and empty paragraphs (spacing) collapsed — the document arrived
// as one page of continuous text.

import { CAPTION_LABELS, captionKindOf, type CaptionKind } from "./captionNumbers";
import type { DocFormat } from "./document";

/** Inline OOXML page break — a run, never a full <w:p> (pandoc wraps raw
 *  blocks in their own paragraph; see docxFields.ts). */
const OOXML_PAGE_BREAK = '<w:r><w:br w:type="page"/></w:r>';

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** CSS length ("8cm", "48px", "1.25cm") to OOXML twips (1cm = 567tw, 96dpi). */
function lengthToTwips(value: string): number {
  const m = /^([\d.]+)\s*(cm|px|pt|mm)?$/.exec(value.trim());
  if (!m) return 0;
  const n = parseFloat(m[1]);
  switch (m[2]) {
    case "px": return Math.round((n / 96) * 1440);
    case "pt": return Math.round(n * 20);
    case "mm": return Math.round((n / 10) * 567);
    case "cm":
    default: return Math.round(n * 567);
  }
}

/** A run of text with bold/italic context → an OOXML <w:r>. Font/size are
 *  left to the paragraph's Normal style (the reference doc makes it Times
 *  12pt), so the runs only carry the marks pandoc's HTML reader would drop
 *  anyway once inside a raw block. */
function ooxmlRun(text: string, bold: boolean, italic: boolean): string {
  if (!text) return "";
  const rpr = `${bold ? "<w:b/>" : ""}${italic ? "<w:i/>" : ""}`;
  return `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ""}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
}

/** Serialize a paragraph's inline content to OOXML runs, honoring bold/italic
 *  (strong/b, em/i); spans are transparent (their font is the doc default). */
function inlineRuns(node: Node, bold: boolean, italic: boolean): string {
  let out = "";
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      out += ooxmlRun(child.textContent ?? "", bold, italic);
      return;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return;
    const tag = child.nodeName;
    if (tag === "STRONG" || tag === "B") out += inlineRuns(child, true, italic);
    else if (tag === "EM" || tag === "I") out += inlineRuns(child, bold, true);
    else if (tag === "BR") out += "<w:r><w:br/></w:r>";
    else out += inlineRuns(child, bold, italic); // span, etc.
  });
  return out;
}

/** OOXML paragraph properties (alignment + indent) from a <p>'s inline style,
 *  or "" when the paragraph carries none. */
function paragraphProps(style: CSSStyleDeclaration): string {
  const align = style.textAlign;
  const jc =
    align === "center" ? '<w:jc w:val="center"/>' :
    align === "right" ? '<w:jc w:val="right"/>' :
    align === "justify" ? '<w:jc w:val="both"/>' : "";
  const left = style.marginLeft ? lengthToTwips(style.marginLeft) : 0;
  const firstLine = style.textIndent ? lengthToTwips(style.textIndent) : 0;
  const ind = left || firstLine
    ? `<w:ind${left ? ` w:left="${left}"` : ""}${firstLine ? ` w:firstLine="${firstLine}"` : ""}/>`
    : "";
  return jc || ind ? `<w:pPr>${jc}${ind}</w:pPr>` : "";
}

/** Whether a paragraph's style carries formatting pandoc's HTML→docx would
 *  drop (alignment other than left, a left margin, or a first-line indent). */
function hasBakeableStyle(style: CSSStyleDeclaration): boolean {
  const a = style.textAlign;
  return (
    a === "center" || a === "right" || a === "justify" ||
    !!style.marginLeft || !!style.textIndent
  );
}

// --- ODF (odt) side -------------------------------------------------------
// OpenDocument has no inline paragraph formatting: alignment/indent live in
// NAMED styles. So instead of the docx path's arbitrary-value w:jc/w:ind, the
// odt path maps a paragraph to one of a FIXED library of styles predefined in
// the embedded reference-abnt.odt (see pandoc.rs). This covers the norm's
// values (center/right/justify + the ABNT indents 1.25cm/8cm); an arbitrary
// indent outside the set can't be expressed and falls back to alignment-only
// or a plain paragraph (documented ODF limitation).

/** OpenDocument page break: an empty paragraph in a break-before-page style. */
const ODF_PAGE_BREAK = '<text:p text:style-name="LObreak"/>';

/** A CSS length in centimeters, or null when it isn't a length we handle. */
function lengthToCm(value: string): number | null {
  const m = /^([\d.]+)\s*(cm|px|pt|mm)?$/.exec(value.trim());
  if (!m) return null;
  const n = parseFloat(m[1]);
  switch (m[2]) {
    case "px": return (n / 96) * 2.54;
    case "pt": return (n / 72) * 2.54;
    case "mm": return n / 10;
    case "cm":
    default: return n;
  }
}

const near = (a: number, b: number) => Math.abs(a - b) < 0.05;

/** Map a paragraph's style to one of the predefined ODF style names, or null
 *  when nothing in the fixed library matches (leave it a plain paragraph). */
function odfParagraphStyle(style: CSSStyleDeclaration): string | null {
  const left = style.marginLeft ? lengthToCm(style.marginLeft) : null;
  const firstLine = style.textIndent ? lengthToCm(style.textIndent) : null;
  const align = style.textAlign;
  if (left !== null && near(left, 8)) return "LOml";
  const fi = firstLine !== null && near(firstLine, 1.25);
  if (fi && align === "justify") return "LOjfi";
  if (fi) return "LOfi";
  if (align === "center") return "LOc";
  if (align === "right") return "LOr";
  if (align === "justify") return "LOj";
  return null;
}

/** A run of text in an ODF <text:span> (bold/italic via predefined text
 *  styles), or bare escaped text when unstyled. */
function odfRun(text: string, bold: boolean, italic: boolean): string {
  if (!text) return "";
  const styleName = bold && italic ? "LObi" : bold ? "LOb" : italic ? "LOi" : "";
  const esc = escapeXml(text);
  return styleName ? `<text:span text:style-name="${styleName}">${esc}</text:span>` : esc;
}

/** Serialize a paragraph's inline content to ODF spans (mirrors inlineRuns). */
function odfInline(node: Node, bold: boolean, italic: boolean): string {
  let out = "";
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      out += odfRun(child.textContent ?? "", bold, italic);
      return;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return;
    const tag = child.nodeName;
    if (tag === "STRONG" || tag === "B") out += odfInline(child, true, italic);
    else if (tag === "EM" || tag === "I") out += odfInline(child, bold, true);
    else if (tag === "BR") out += "<text:line-break/>";
    else out += odfInline(child, bold, italic);
  });
  return out;
}

const TOC_TITLES: Record<string, string> = {
  "": "Sumário",
  figures: "Lista de Figuras",
  tables: "Lista de Tabelas",
};

/**
 * Rewrite app-only markup for a pandoc export:
 *
 * - `div[data-page-break]`: DOCX gets a real page break (inline raw OOXML,
 *   `data-ooxml` marker consumed by the markdown path — the caller routes
 *   the doc through markdown when any marker is present). ODT/RTF have no
 *   raw channel here: the marker is dropped whole, so at least the label
 *   text never leaks into the document.
 * - `nav[data-toc]`: baked as a bold title plus one indented paragraph per
 *   entry (headings or captions). No page numbers — the reader repaginates
 *   by its own geometry, so any number we baked would be wrong.
 * - `<p></p>`: pandoc's readers drop empty paragraphs; fill them with NBSP
 *   so the user's blank lines survive (the editor shows one line each —
 *   same fix as print's `p:empty::before`, but baked because there is no
 *   CSS on this side).
 */
/** A block-level raw marker consumed by the markdown export path (turndown →
 *  fenced ```{=openxml|=opendocument}). rtf has no raw channel: returns null. */
function rawBlock(doc: Document, format: DocFormat, xml: string): HTMLElement | null {
  if (format === "rtf") return null;
  const fmt = format === "docx" ? "openxml" : "opendocument";
  const block = doc.createElement("div");
  block.setAttribute("data-raw-block", xml);
  block.setAttribute("data-raw-fmt", fmt);
  return block;
}

export function prepareForPandoc(html: string, format: DocFormat): string {
  // Empty paragraphs may carry attributes (text-align on a centered blank
  // line), so the cheap gate has to be a regex, not includes("<p></p>").
  // style= gates the alignment/indent baking (docx + odt, below).
  const bakesStyle = format === "docx" || format === "odt";
  const needsWork =
    html.includes("data-page-break") ||
    html.includes("data-toc") ||
    /<p[^>]*><\/p>/.test(html) ||
    (bakesStyle && html.includes("style="));
  if (!needsWork) return html;
  const doc = new DOMParser().parseFromString(html, "text/html");

  doc.querySelectorAll("[data-page-break]").forEach((el) => {
    // docx: inline OOXML break run (goes inside pandoc's own paragraph).
    // odt: a break-before-page paragraph (raw block). rtf: dropped.
    if (format === "docx") {
      const p = doc.createElement("p");
      const marker = doc.createElement("span");
      marker.setAttribute("data-ooxml", OOXML_PAGE_BREAK);
      p.appendChild(marker);
      el.replaceWith(p);
      return;
    }
    const block = format === "odt" ? rawBlock(doc, format, ODF_PAGE_BREAK) : null;
    if (block) el.replaceWith(block);
    else el.remove();
  });

  doc.querySelectorAll("nav[data-toc]").forEach((nav) => {
    const kind = nav.getAttribute("data-toc") ?? "";
    const frag = doc.createDocumentFragment();
    const title = doc.createElement("p");
    const strong = doc.createElement("strong");
    strong.textContent = TOC_TITLES[kind] ?? TOC_TITLES[""];
    title.appendChild(strong);
    frag.appendChild(title);

    for (const { text, level } of tocEntries(doc, kind)) {
      const p = doc.createElement("p");
      // NBSP indentation: survives pandoc in every target format, unlike
      // margins/styles, and reads fine in Word/Writer.
      p.textContent = "\u00a0\u00a0\u00a0".repeat(Math.max(0, level - 1)) + text;
      frag.appendChild(p);
    }
    nav.replaceWith(frag);
  });

  // :empty misses nothing here: the editor serializes blank lines as bare
  // <p></p> (attributes like text-align may exist, children never). Do this
  // BEFORE the alignment bake so a styled-but-empty spacer line stays a plain
  // NBSP paragraph (nothing to center) instead of an empty OOXML paragraph.
  doc.querySelectorAll("p:empty").forEach((p) => {
    p.textContent = "\u00a0";
  });

  // Alignment / indent bake (docx + odt): pandoc's HTML reader drops inline
  // CSS (text-align, margin-left, text-indent), so a centered ABNT cover or an
  // 8cm-indented "natureza do trabalho" arrives left-aligned. Rewrite those
  // paragraphs as native raw blocks \u2014 docx uses arbitrary-value w:jc/w:ind; odt
  // maps to predefined named styles (fixed norm values). Both inherit Times
  // from their reference doc. rtf has no raw channel (documented limitation).
  if (bakesStyle) {
    doc.querySelectorAll("p[style]").forEach((p) => {
      const style = (p as HTMLElement).style;
      if (!hasBakeableStyle(style)) return;
      // Blank/NBSP-only spacer lines: leave as plain (NBSP) paragraphs —
      // centering an empty line does nothing, and keeping them as ordinary
      // paragraphs preserves the vertical spacing without extra raw XML.
      if (!(p.textContent ?? "").trim()) return; // trim() remove NBSP (WhiteSpace do ES)
      let xml: string;
      if (format === "odt") {
        const pStyle = odfParagraphStyle(style);
        if (!pStyle) return; // arbitrary value with no matching named style
        xml = `<text:p text:style-name="${pStyle}">${odfInline(p, false, false)}</text:p>`;
      } else {
        const runs = inlineRuns(p, false, false);
        if (!runs) return;
        xml = `<w:p>${paragraphProps(style)}${runs}</w:p>`;
      }
      const block = rawBlock(doc, format, xml);
      if (block) p.replaceWith(block);
    });
  }

  return doc.body.innerHTML;
}

/** The entries a TOC nav lists: document headings, or figure/table captions
 *  (numbered here — caption numbers are editor decorations and, on the DOCX
 *  native-fields path, SEQ fields that don't exist yet at this stage). */
function tocEntries(doc: Document, kind: string): { text: string; level: number }[] {
  if (kind === "figures" || kind === "tables") {
    const want: CaptionKind = kind === "figures" ? "figure" : "table";
    const out: { text: string; level: number }[] = [];
    const counts: Record<CaptionKind, number> = { figure: 0, table: 0 };
    doc.querySelectorAll("p[data-caption]").forEach((p) => {
      const k = captionKindOf(p.getAttribute("data-caption"));
      const n = ++counts[k];
      if (k !== want) return;
      out.push({ text: `${CAPTION_LABELS[k]} ${n} — ${p.textContent || "(sem legenda)"}`, level: 1 });
    });
    return out;
  }
  const out: { text: string; level: number }[] = [];
  doc.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((h) => {
    if (h.closest("[data-footnotes]") || h.closest("section.bibliography")) return;
    out.push({ text: h.textContent || "(sem título)", level: Number(h.tagName[1]) });
  });
  return out;
}
