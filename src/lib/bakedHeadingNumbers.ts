import { advanceHeadingCounter, newHeadingCounters } from "../editor/HeadingNumbers";

/**
 * Automatic heading numbers ("1", "1.1", …) live as editor decorations and
 * never serialize. Exports bake them into the text (like print does) so a
 * Word/browser reader sees what the editor showed — and opening such a file
 * must strip them back out, or the editor decorates the headings again and
 * the numbers double ("1 1 Título").
 *
 * The baked prefix is marked with `<span data-baked-heading-num>` for
 * deterministic stripping. DOCX/ODT round-trips lose the attribute, so there
 * is also a conservative heuristic for plain-text prefixes.
 */

// Number followed by a space (regular or NBSP) and NO dot — a dot after the
// number means it was typed by hand, never baked by us.
const PREFIX_RE = /^(\d+(?:\.\d+)*)[  ]/;

/** Headings inside generated sections are never numbered. */
function contentHeadings(doc: Document): Element[] {
  return Array.from(doc.querySelectorAll("h1, h2, h3, h4, h5, h6")).filter(
    (h) => !h.closest("[data-footnotes]") && !h.closest("section.bibliography")
  );
}

/** Prepend the automatic number to every content heading, as a marked span. */
export function bakeHeadingNumbers(html: string): string {
  if (!/<h[1-6]/i.test(html)) return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const counters = newHeadingCounters();
  for (const h of contentHeadings(doc)) {
    const label = advanceHeadingCounter(counters, Number(h.tagName[1]));
    const num = doc.createElement("span");
    num.setAttribute("data-baked-heading-num", "");
    num.textContent = `${label} `;
    h.prepend(num);
  }
  return doc.body.innerHTML;
}

/** Strip a leading "1.2 " from the heading's first non-empty text node. */
function stripPrefixText(h: Element): void {
  const walker = h.ownerDocument.createTreeWalker(h, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node && !node.textContent?.trim()) node = walker.nextNode();
  if (node) node.textContent = (node.textContent ?? "").replace(PREFIX_RE, "");
}

/** Every content heading carries a plain-text prefix exactly matching what
 *  the automatic counter would generate — the same sequence a real bake
 *  would have produced, so it's a strong signal the numbers came from this
 *  app (or a document numbered by hand in the exact same convention). */
function matchesAutoSequence(headings: Element[]): boolean {
  const counters = newHeadingCounters();
  return (
    headings.length > 0 &&
    headings.every((h) => {
      const m = PREFIX_RE.exec(h.textContent ?? "");
      return !!m && m[1] === advanceHeadingCounter(counters, Number(h.tagName[1]));
    })
  );
}

/**
 * Detect the same sequence `stripBakedHeadingNumbers`'s heuristic would
 * strip, without mutating anything — lets a caller ask the user for
 * confirmation before content is silently rewritten (see lib/document.ts).
 */
export function detectManualNumberingSequence(html: string): boolean {
  if (!/<h[1-6]/i.test(html)) return false;
  const doc = new DOMParser().parseFromString(html, "text/html");
  return matchesAutoSequence(contentHeadings(doc));
}

/**
 * Remove baked heading numbers from incoming HTML.
 *
 * Marked spans (`data-baked-heading-num`, or a stray copy of the editor's
 * `span.heading-num` decoration) are always removed. When `stripUnmarked` is
 * on — i.e. automatic numbering is currently enabled, so leftover numbers
 * would double — plain-text prefixes are also stripped, but only when EVERY
 * content heading carries one and the whole sequence is exactly what the
 * automatic counter would generate. A single heading off-sequence (or a
 * "2001. Uma Odisseia"-style dot after the number) means the numbers are real
 * content and nothing is touched.
 */
export function stripBakedHeadingNumbers(html: string, stripUnmarked = false): string {
  if (!/<h[1-6]/i.test(html)) return html;
  // Nothing to strip and automatic numbering is off (so nothing would
  // double either): skip the DOM parse entirely. This is the common case on
  // every file open when numberHeadings is off.
  if (!stripUnmarked && !html.includes("data-baked-heading-num") && !html.includes("heading-num")) return html;
  const doc = new DOMParser().parseFromString(html, "text/html");

  doc
    .querySelectorAll("span[data-baked-heading-num], span.heading-num")
    .forEach((el) => el.remove());

  if (stripUnmarked) {
    const headings = contentHeadings(doc);
    if (matchesAutoSequence(headings)) headings.forEach(stripPrefixText);
  }

  return doc.body.innerHTML;
}
