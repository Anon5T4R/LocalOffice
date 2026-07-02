/**
 * Review data (comments, tracked changes) <-> pandoc's docx representation.
 *
 * pandoc's docx writer turns spans with class comment-start/comment-end into
 * native Word comments, and spans with class insertion/deletion (+ author /
 * date attributes) into native tracked changes. Its docx reader (with
 * --track-changes=all) emits the same shapes back.
 */

import { newId } from "./id";

const isoDate = (ts: number) => new Date(ts || Date.now()).toISOString();

/** Editor HTML -> pandoc-friendly HTML (call before a DOCX/ODT export). */
export function bakeReviewForDocx(html: string): string {
  if (!html.includes("data-comment-id") && !html.includes("data-insertion") && !html.includes("data-deletion")) {
    return html;
  }
  const doc = new DOMParser().parseFromString(html, "text/html");

  // Comments: emit start/end anchors around the first/last span of each id.
  const seen = new Set<string>();
  doc.querySelectorAll("span[data-comment-id]").forEach((el) => {
    const id = el.getAttribute("data-comment-id")!;
    const spans = doc.querySelectorAll(`span[data-comment-id="${CSS.escape(id)}"]`);
    if (seen.has(id)) return;
    seen.add(id);

    const first = spans[0];
    const last = spans[spans.length - 1];
    const start = doc.createElement("span");
    start.className = "comment-start";
    start.id = id;
    start.setAttribute("author", first.getAttribute("data-comment-author") || "Autor");
    start.setAttribute("date", isoDate(Number(first.getAttribute("data-comment-ts"))));
    start.textContent = first.getAttribute("data-comment-text") || "";
    const end = doc.createElement("span");
    end.className = "comment-end";
    end.id = id;
    first.before(start);
    last.after(end);
    // Unwrap the highlight spans, keeping their content in place.
    spans.forEach((s) => s.replaceWith(...s.childNodes));
  });

  // Tracked changes: rename to pandoc's classes/attributes.
  const convert = (selector: string, className: string) => {
    doc.querySelectorAll(selector).forEach((el) => {
      const span = doc.createElement("span");
      span.className = className;
      span.setAttribute("author", el.getAttribute("data-author") || "Autor");
      span.setAttribute("date", isoDate(Number(el.getAttribute("data-ts"))));
      span.replaceChildren(...el.childNodes);
      el.replaceWith(span);
    });
  };
  convert("span[data-insertion]", "insertion");
  convert("span[data-deletion]", "deletion");

  return doc.body.innerHTML;
}

/** pandoc import HTML -> editor HTML (comment anchors become comment marks). */
export function reviewFromPandoc(html: string): string {
  if (!html.includes("comment-start")) return html;
  const doc = new DOMParser().parseFromString(html, "text/html");

  doc.querySelectorAll("span.comment-start").forEach((start) => {
    const id = start.id || newId("c-");
    // pandoc's html writer prefixes unknown attributes with data- on reimport.
    const author = start.getAttribute("author") || start.getAttribute("data-author") || "";
    const text = start.textContent || "";
    const ts =
      Date.parse(start.getAttribute("date") || start.getAttribute("data-date") || "") || Date.now();

    // Wrap the siblings between start and its matching end. Ranges that cross
    // block boundaries are skipped — the text survives, the comment doesn't.
    const wrap = doc.createElement("span");
    wrap.setAttribute("data-comment-id", id);
    wrap.setAttribute("data-comment-text", text);
    wrap.setAttribute("data-comment-author", author);
    wrap.setAttribute("data-comment-ts", String(ts));
    let node = start.nextSibling;
    const collected: ChildNode[] = [];
    let end: Element | null = null;
    while (node) {
      if (node instanceof Element && node.classList.contains("comment-end")) {
        end = node;
        break;
      }
      collected.push(node);
      node = node.nextSibling;
    }
    if (end) {
      start.after(wrap);
      collected.forEach((n) => wrap.appendChild(n));
      end.remove();
    }
    start.remove();
  });
  // Orphan end anchors (cross-block ranges) are dropped.
  doc.querySelectorAll("span.comment-end").forEach((el) => el.remove());

  return doc.body.innerHTML;
}
