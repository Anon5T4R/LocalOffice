// Native Word fields (SEQ/REF + bookmarks) for the markdown->docx/odt export
// path. Distinct from captionNumbers.bakeCaptionNumbers (plain-text baking
// used by the HTML export path): this one emits raw OOXML runs that only
// survive when pandoc reads the markdown with the raw_attribute extension
// (see export_via_pandoc in pandoc.rs) -- Word then computes/updates the
// numbers itself instead of us baking a frozen number.
//
// Validated by hand against a real Word-compatible engine (ONLYOFFICE x2t)
// during the 12.4 spike: pandoc's raw_attribute wraps each markdown raw
// block in its OWN <w:p>, so a raw block that is itself a full <w:p>
// produces invalid nested paragraphs -- only inline runs (<w:r>...</w:r>),
// embedded inside an ordinary markdown paragraph, are safe.

import { CAPTION_LABELS, captionKindOf, type CaptionKind } from "./captionNumbers";
import { advanceHeadingCounter, newHeadingCounters } from "../editor/HeadingNumbers";

function escapeXmlText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Word bookmark names: letters/digits/underscore only, must start with a
// letter, max 40 chars. refIds (newId("ref-")) are already safe, but this
// is the export boundary -- sanitize defensively rather than trust it.
function bookmarkName(refId: string): string {
  return `Ref_${refId.replace(/[^A-Za-z0-9_]/g, "")}`.slice(0, 40);
}

function seqFieldRuns(seqName: string, cached: number): string {
  return (
    `<w:r><w:fldChar w:fldCharType="begin"/></w:r>` +
    `<w:r><w:instrText xml:space="preserve"> SEQ ${seqName} \\* ARABIC </w:instrText></w:r>` +
    `<w:r><w:fldChar w:fldCharType="separate"/></w:r>` +
    `<w:r><w:t>${cached}</w:t></w:r>` +
    `<w:r><w:fldChar w:fldCharType="end"/></w:r>`
  );
}

function refFieldRuns(bookmark: string, cachedText: string): string {
  return (
    `<w:r><w:fldChar w:fldCharType="begin"/></w:r>` +
    `<w:r><w:instrText xml:space="preserve"> REF ${bookmark} \\h </w:instrText></w:r>` +
    `<w:r><w:fldChar w:fldCharType="separate"/></w:r>` +
    `<w:r><w:t xml:space="preserve">${escapeXmlText(cachedText)}</w:t></w:r>` +
    `<w:r><w:fldChar w:fldCharType="end"/></w:r>`
  );
}

/**
 * Inline marker a turndown rule (markdown.ts) turns into a raw OOXML span.
 * `suffix`, if given, is literal markdown text emitted right after the raw
 * block IN THE SAME replacement string -- not a sibling text node, which
 * would lose its leading whitespace (see ooxmlRawReplacement in markdown.ts).
 */
function ooxmlMarker(doc: Document, xml: string, suffix = ""): HTMLElement {
  const marker = doc.createElement("span");
  marker.setAttribute("data-ooxml", xml);
  if (suffix) marker.setAttribute("data-suffix", suffix);
  return marker;
}

interface RefTarget {
  bookmark: string;
  label: string;
}

/** Strips leading whitespace off `el`'s next sibling text node and returns
 *  it, so the caller can carry it into its own replacement string instead
 *  of leaving it as a doomed sibling text node (see ooxmlMarker's suffix). */
function absorbLeadingWhitespace(el: Element): string {
  const next = el.nextSibling;
  if (next?.nodeType !== Node.TEXT_NODE) return "";
  const text = next.textContent ?? "";
  const m = /^\s+/.exec(text);
  if (!m) return "";
  next.textContent = text.slice(m[0].length);
  return m[0];
}

/**
 * Bakes captions and cross-references into native Word fields instead of
 * plain text: SEQ for caption numbers (Word recalculates on reorder), REF +
 * bookmarks for cross-references (Word updates the displayed text on F9).
 * Headings that are cross-reference targets get a bookmark too, so a REF to
 * a section resolves the same way. String-in/string-out, mirroring
 * bakeCaptionNumbers's shape.
 */
export function bakeNativeFieldsForDocx(html: string): string {
  if (!html.includes("data-caption") && !html.includes("data-crossref")) return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  let bookmarkId = 0;
  const refMap = new Map<string, RefTarget>();

  const counts: Record<CaptionKind, number> = { figure: 0, table: 0 };
  doc.querySelectorAll("p[data-caption]").forEach((p) => {
    const kind = captionKindOf(p.getAttribute("data-caption"));
    const n = ++counts[kind];
    const seqName = CAPTION_LABELS[kind];
    const refId = p.getAttribute("data-ref-id");
    p.removeAttribute("data-caption");
    p.removeAttribute("data-ref-id");

    let bookmark: string | null = null;
    if (refId) {
      bookmark = bookmarkName(refId);
      refMap.set(refId, { bookmark, label: `${seqName} ${n}` });
    }

    let xml = "";
    if (bookmark) xml += `<w:bookmarkStart w:id="${++bookmarkId}" w:name="${bookmark}"/>`;
    xml += seqFieldRuns(seqName, n);
    if (bookmark) xml += `<w:bookmarkEnd w:id="${bookmarkId}"/>`;

    p.prepend(ooxmlMarker(doc, xml, " — "));
    p.insertBefore(doc.createTextNode(`${seqName} `), p.firstChild);
  });

  // Headings can be cross-reference targets too; wrap them in a bookmark
  // (no visible field -- the heading text itself is already the content).
  const headingCounters = newHeadingCounters();
  doc.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((h) => {
    if (h.closest("[data-footnotes]") || h.closest("section.bibliography")) return;
    const level = Number(h.tagName[1]);
    const label = advanceHeadingCounter(headingCounters, level);
    const refId = h.getAttribute("data-ref-id");
    if (!refId) return;
    const bookmark = bookmarkName(refId);
    refMap.set(refId, { bookmark, label: `Seção ${label}` });
    const id = ++bookmarkId;
    h.prepend(ooxmlMarker(doc, `<w:bookmarkStart w:id="${id}" w:name="${bookmark}"/>`));
    h.append(ooxmlMarker(doc, `<w:bookmarkEnd w:id="${id}"/>`));
  });

  // Cross-references resolve last, once every target has a bookmark. A
  // target with no refId (dangling ref) prints "ref?" as plain text, same
  // fallback the print pipeline uses -- there's no bookmark to point a REF
  // field at.
  doc.querySelectorAll("span[data-crossref]").forEach((el) => {
    // The crossref span sits in running text ("...na <ref> e na <ref>...")
    // that this function doesn't otherwise touch. Absorb any whitespace
    // right after it into our own replacement, same trick as the caption
    // suffix above -- a sibling text node's leading whitespace is exactly
    // what turndown drops next to a blank-replaced inline element.
    const suffix = absorbLeadingWhitespace(el);
    const target = refMap.get(el.getAttribute("data-crossref") ?? "");
    if (!target) {
      el.replaceWith(doc.createTextNode(`ref?${suffix}`));
      return;
    }
    el.replaceWith(ooxmlMarker(doc, refFieldRuns(target.bookmark, target.label), suffix));
  });

  return doc.body.innerHTML;
}
