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
export function prepareForPandoc(html: string, format: DocFormat): string {
  // Empty paragraphs may carry attributes (text-align on a centered blank
  // line), so the cheap gate has to be a regex, not includes("<p></p>").
  const needsWork =
    html.includes("data-page-break") || html.includes("data-toc") || /<p[^>]*><\/p>/.test(html);
  if (!needsWork) return html;
  const doc = new DOMParser().parseFromString(html, "text/html");

  doc.querySelectorAll("[data-page-break]").forEach((el) => {
    if (format !== "docx") {
      el.remove();
      return;
    }
    const p = doc.createElement("p");
    const marker = doc.createElement("span");
    marker.setAttribute("data-ooxml", OOXML_PAGE_BREAK);
    p.appendChild(marker);
    el.replaceWith(p);
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
  // <p></p> (attributes like text-align may exist, children never).
  doc.querySelectorAll("p:empty").forEach((p) => {
    p.textContent = "\u00a0";
  });

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
