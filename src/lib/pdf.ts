import { advanceHeadingCounter, newHeadingCounters } from "../editor/HeadingNumbers";
import { bakeCitationsInto } from "./citationStore";
import { HeaderFooterSpec, PageFormat, PageMargins } from "./settings";

/**
 * Print/PDF pipeline.
 *
 * Primary path: paged.js (lazy-loaded) fragments the document into real page
 * boxes with CSS Paged Media — margin-box headers/footers, page counters and
 * manual breaks — rendered into a preview container that window.print() then
 * prints as-is (WYSIWYG by construction).
 *
 * Fallback path: `printLegacy` keeps the old direct-to-print flow so exporting
 * never depends on paged.js working.
 *
 * Dependency risk (avaliado em docs/SPIKE-VIVLIOSTYLE.md): paged.js 0.4.3 não
 * recebe release desde 2022. A alternativa mantida (Vivliostyle) é AGPL-3.0 —
 * incompatível com distribuir este app MIT — e não rende melhor no nosso
 * conjunto de features. Se um dia quebrar: vendorizar/forkar (MIT) ou cair no
 * printLegacy. A API de progresso abaixo é agnóstica de motor de propósito.
 */

export interface PrintOptions {
  title: string;
  pageFormat: PageFormat;
  margins: PageMargins;
  header: HeaderFooterSpec;
  footer: HeaderFooterSpec;
  /** Print header/footer on the first page too (off for cover pages). */
  chromeOnFirst: boolean;
  /** Bake automatic heading numbers (1, 1.1…) into the printed text. */
  numberHeadings: boolean;
}

/** CSS `size` for each page format ("classic" free-flow prints as A4). */
const PAGE_SIZE_CSS: Record<PageFormat, string> = {
  classic: "210mm 297mm",
  a4: "210mm 297mm",
  a5: "148mm 210mm",
  letter: "215.9mm 279.4mm",
  a3: "297mm 420mm",
};

// ---------------------------------------------------------------------------
// Print preprocessing
// ---------------------------------------------------------------------------

/**
 * Prepare editor HTML for printing:
 *
 * - Footnote numbers become literal text. The editor numbers them with CSS
 *   counters, but paged.js re-fragments the content across page boxes and
 *   counters don't survive fragmentation — baked numbers work in any engine.
 * - Page-break markers are emptied. Their "Quebra de página" label is display
 *   -only, and paged.js gives any non-empty break element a page of its own.
 * - Heading numbers (editor decorations, which don't serialize) are baked in.
 * - TOC placeholders (`nav[data-toc]`) become a real list of anchors; the page
 *   numbers are filled by CSS `target-counter` during pagination.
 * - Citations and the bibliography become formatted static text.
 */
export function preparePrintHtml(html: string, opts: Pick<PrintOptions, "numberHeadings">): string {
  const needsWork =
    opts.numberHeadings ||
    html.includes("data-fn-ref") ||
    html.includes("data-page-break") ||
    html.includes("data-toc") ||
    html.includes("data-citation") ||
    html.includes("data-bibliography");
  if (!needsWork) return html;

  const doc = new DOMParser().parseFromString(html, "text/html");

  bakeCitationsInto(doc);

  // Footnotes: bake numbers.
  const order = new Map<string, number>();
  doc.querySelectorAll("sup[data-fn-ref]").forEach((el) => {
    const id = el.getAttribute("data-fn-ref")!;
    if (!order.has(id)) order.set(id, order.size + 1);
    el.textContent = String(order.get(id));
  });
  doc.querySelectorAll("[data-footnote]").forEach((el) => {
    const n = order.get(el.getAttribute("data-footnote") ?? "");
    const marker = doc.createElement("span");
    marker.className = "footnote-num";
    marker.textContent = `${n ?? "?"}. `;
    el.prepend(marker);
  });

  // Page breaks: strip labels.
  doc.querySelectorAll("[data-page-break]").forEach((el) => el.replaceChildren());

  // Headings: collect entries, assign anchor ids, optionally bake numbers.
  // Must mirror the editor's decoration logic (same counter helper).
  const counters = newHeadingCounters();
  const entries: { level: number; text: string; id: string }[] = [];
  doc.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((h, i) => {
    // Skip generated sections: footnotes and the baked bibliography heading.
    if (h.closest("[data-footnotes]") || h.closest("section.bibliography")) return;
    const level = Number(h.tagName[1]);
    const label = advanceHeadingCounter(counters, level);
    const text = h.textContent ?? "";
    if (!h.id) h.id = `toc-h-${i}`;
    if (opts.numberHeadings) {
      // Marked span (not a bare text node) so reimport paths can strip the
      // baked number deterministically — see lib/bakedHeadingNumbers.ts.
      const num = doc.createElement("span");
      num.setAttribute("data-baked-heading-num", "");
      num.textContent = `${label} `;
      h.prepend(num);
    }
    entries.push({ level, text: opts.numberHeadings ? `${label} ${text}` : text, id: h.id });
  });

  // TOC placeholders → anchor list (page number via ::after + target-counter).
  doc.querySelectorAll("nav[data-toc]").forEach((nav) => {
    nav.className = "toc";
    nav.replaceChildren();
    const header = doc.createElement("div");
    header.className = "toc-header";
    header.textContent = "Sumário";
    nav.appendChild(header);
    for (const e of entries) {
      const a = doc.createElement("a");
      a.href = `#${e.id}`;
      a.className = `toc-entry lvl-${e.level}`;
      const title = doc.createElement("span");
      title.className = "toc-title";
      title.textContent = e.text;
      const dots = doc.createElement("span");
      dots.className = "toc-dots";
      a.append(title, dots);
      nav.appendChild(a);
    }
  });

  return doc.body.innerHTML;
}

// ---------------------------------------------------------------------------
// @page CSS generation
// ---------------------------------------------------------------------------

/**
 * Translate a header/footer template into a CSS `content` value.
 * Text is emitted as quoted strings; {page}/{pages} become counters.
 */
function cssContent(template: string, vars: { title: string; date: string }): string {
  const resolved = template
    .replace(/\{title\}/g, vars.title)
    .replace(/\{date\}/g, vars.date);
  const parts = resolved
    .split(/(\{page\}|\{pages\})/)
    .filter(Boolean)
    .map((part) => {
      if (part === "{page}") return "counter(page)";
      if (part === "{pages}") return "counter(pages)";
      return JSON.stringify(part);
    });
  return parts.length ? parts.join(" ") : '""';
}

/** One margin box (e.g. "@top-right") with its content, or "" when unused. */
function marginBox(box: string, template: string, vars: { title: string; date: string }): string {
  if (!template.trim()) return "";
  return `${box} { content: ${cssContent(template, vars)}; }`;
}

/**
 * Build the full stylesheet handed to paged.js. This is the only CSS the
 * fragmenter sees, so it must carry the @page rules, break rules and content
 * typography. Every selector is scoped under .print-content so the styles,
 * which paged.js re-injects into the live document, never leak into the app.
 */
function buildPrintCss(opts: PrintOptions): string {
  const vars = {
    title: opts.title,
    date: new Date().toLocaleDateString(),
  };
  const m = opts.margins;
  const boxes = [
    marginBox("@top-left", opts.header.left, vars),
    marginBox("@top-center", opts.header.center, vars),
    marginBox("@top-right", opts.header.right, vars),
    marginBox("@bottom-left", opts.footer.left, vars),
    marginBox("@bottom-center", opts.footer.center, vars),
    marginBox("@bottom-right", opts.footer.right, vars),
  ].filter(Boolean);

  const firstPage = opts.chromeOnFirst
    ? ""
    : `@page :first {
        @top-left { content: none; } @top-center { content: none; } @top-right { content: none; }
        @bottom-left { content: none; } @bottom-center { content: none; } @bottom-right { content: none; }
      }`;

  return `
    @page {
      size: ${PAGE_SIZE_CSS[opts.pageFormat] || PAGE_SIZE_CSS.a4};
      margin: ${m.top}px ${m.right}px ${m.bottom}px ${m.left}px;
      ${boxes.join("\n      ")}
    }
    ${firstPage}

    .print-content {
      font-size: 12pt;
      line-height: 1.5;
      color: #000;
    }
    .print-content img { max-width: 100%; }
    .print-content table { border-collapse: collapse; width: 100%; }
    .print-content th, .print-content td { border: 1px solid #999; padding: 4px 8px; }
    .print-content [data-page-break] { break-after: page; border: none; height: 0; margin: 0; }
    .print-content .page-break-label { display: none; }
    .print-content .footnote-ref { font-weight: 600; }
    .print-content .footnotes {
      margin-top: 2em;
      padding-top: 0.6em;
      border-top: 1px solid #999;
      font-size: 0.85em;
    }
    .print-content .footnote-item p { display: inline; margin: 0; }
    .print-content .footnote-num { font-weight: 600; }

    .print-content nav.toc { margin: 1em 0 2em; }
    .print-content .toc-header { font-size: 1.4em; font-weight: 700; margin-bottom: 0.6em; }
    .print-content a.toc-entry {
      display: flex;
      align-items: baseline;
      gap: 6px;
      margin: 0.3em 0;
      color: #000;
      text-decoration: none;
    }
    .print-content .toc-dots { flex: 1; min-width: 24px; border-bottom: 1px dotted #999; }
    .print-content a.toc-entry::after { content: target-counter(attr(href), page); }
    .print-content a.toc-entry.lvl-2 { padding-left: 1.4em; }
    .print-content a.toc-entry.lvl-3 { padding-left: 2.8em; }
    .print-content a.toc-entry.lvl-4, .print-content a.toc-entry.lvl-5, .print-content a.toc-entry.lvl-6 { padding-left: 4.2em; }

    .print-content section.bibliography h2 { break-after: avoid; }
    .print-content .csl-entry { margin: 0.6em 0; }

    /* Tracked changes print "with markup" (Word's default); comment highlights
       are not printed — the anchor spans render as plain text. */
    .print-content .track-ins { color: #166534; text-decoration: underline; }
    .print-content .track-del { color: #991b1b; text-decoration: line-through; }
  `;
}

// ---------------------------------------------------------------------------
// Paged.js rendering
// ---------------------------------------------------------------------------

/** Immediately remove everything a paged.js run left behind (styles + pages). */
function wipePagedOutput(container?: HTMLElement | null): void {
  document.head
    .querySelectorAll("style[data-pagedjs-inserted-styles]")
    .forEach((el) => el.remove());
  container?.replaceChildren();
}

/**
 * Queue a cleanup of paged.js output. Goes through the render queue on
 * purpose: wiping the container or the injected styles while a render is in
 * flight leaves paged.js waiting on removed DOM and its promise never settles
 * (which would also jam the queue for every future render).
 */
export function cleanupPaged(container?: HTMLElement | null): void {
  renderQueue = renderQueue.catch(() => {}).then(() => wipePagedOutput(container));
}

/**
 * Fragment `contentHtml` into real page boxes inside `container`.
 * Returns the exact page count. Throws if paged.js fails — callers decide
 * whether to fall back to `printLegacy`.
 *
 * Renders are serialized: paged.js works through document-global state
 * (injected styles, handlers), so two overlapping renders corrupt each other
 * and hang. React StrictMode mounts effects twice in dev, which makes the
 * overlap the norm, not the exception.
 */
export function renderPaged(
  contentHtml: string,
  container: HTMLElement,
  opts: PrintOptions,
  onProgress?: (pagesSoFar: number) => void
): Promise<number> {
  const job = renderQueue.then(() => doRenderPaged(contentHtml, container, opts, onProgress));
  renderQueue = job.catch(() => {}); // a failed render must not block the next one
  return job;
}

let renderQueue: Promise<unknown> = Promise.resolve();

async function doRenderPaged(
  contentHtml: string,
  container: HTMLElement,
  opts: PrintOptions,
  onProgress?: (pagesSoFar: number) => void
): Promise<number> {
  // Lazy import: paged.js is only needed for print/preview, so it lives in its
  // own chunk and never delays app startup.
  const { Previewer } = await import("pagedjs");

  // The caller may have unmounted while waiting in the queue.
  if (!container.isConnected) throw new Error("preview container detached");

  wipePagedOutput(container);

  const template = document.createElement("template");
  template.innerHTML = `<div class="print-content">${preparePrintHtml(contentHtml, opts)}</div>`;

  const cssUrl = URL.createObjectURL(
    new Blob([buildPrintCss(opts)], { type: "text/css" })
  );
  try {
    const previewer = new Previewer();
    // Progress: the total is only known at the end, so callers get a live
    // page count, not a percentage.
    if (onProgress) {
      let count = 0;
      previewer.on("page", () => onProgress(++count));
    }
    // Safety net: a render that never settles would jam the queue for every
    // future render. 90s is far beyond any legitimate pagination time.
    const flow = await Promise.race([
      previewer.preview(template.content, [cssUrl], container),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("paged.js: tempo esgotado ao paginar")), 90_000)
      ),
    ]);
    return flow.total;
  } finally {
    URL.revokeObjectURL(cssUrl);
  }
}

// ---------------------------------------------------------------------------
// Legacy fallback (no pagination engine, no headers/footers)
// ---------------------------------------------------------------------------

/**
 * Old print path: dump the content into a hidden print root and let the
 * browser paginate. No page numbers or headers, but it always works.
 */
export function printLegacy(contentHtml: string, opts: PrintOptions): void {
  document.getElementById("print-root")?.remove();

  const root = document.createElement("div");
  root.id = "print-root";
  root.innerHTML = `<div class="print-content">${preparePrintHtml(contentHtml, opts)}</div>`;

  // margin:0 leaves no room for the browser's own header/footer (date, title,
  // page number, URL); the visual margins live in .print-content padding.
  const style = document.createElement("style");
  style.textContent = `@media print { @page { size: ${
    PAGE_SIZE_CSS[opts.pageFormat] || PAGE_SIZE_CSS.a4
  }; margin: 0; } }`;
  root.appendChild(style);
  document.body.appendChild(root);

  const cleanup = () => {
    root.remove();
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  setTimeout(cleanup, 60000);

  window.print();
}
