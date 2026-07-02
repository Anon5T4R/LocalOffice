import { Extension } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorView } from "@tiptap/pm/view";
import { effectiveLayout } from "./DocLayout";
import { loadSettings } from "../lib/settings";
import type { HeaderFooterSpec, PageMargins } from "../lib/settings";
import { printableHeightPx } from "../lib/pageGeometry";

interface PageBreakState {
  decorations: DecorationSet;
  /** Pages implied by the breaks below (breaks + 1); 1 for "classic" (no
   *  fixed page height, so this plugin has no opinion -- StatusBar keeps its
   *  own scrollHeight-based estimate for that format). */
  pageCount: number;
}

const key = new PluginKey<PageBreakState>("pageBreaks");

// The bg-colored band between two sheets (over and above each page's own
// white top/bottom margins, which flank it).
const SHEET_GAP_PX = 28;

// view -> its remeasure trigger, so App can force a chrome recompute when
// something the plugin can't see in a transaction changes (the doc title,
// which drives {title} in the header/footer but lives on a DOM dataset).
const scheduleByView = new WeakMap<EditorView, () => void>();

/** Current page count, for StatusBar to show a number consistent with the
 *  breaks actually drawn (not an independent scrollHeight/printable guess,
 *  which would drift once the gap decorations themselves add height). */
export function getPageCount(state: EditorState): number {
  return key.getState(state)?.pageCount ?? 1;
}

/** Force the per-page header/footer chrome to recompute now. App calls this
 *  when the document title changes (a DOM-dataset change the plugin would
 *  not otherwise observe, since it isn't a ProseMirror transaction). */
export function recomputePageChrome(editor: Editor): void {
  scheduleByView.get(editor.view)?.();
}

/**
 * Line-level split data for a paragraph, produced LAZILY -- only for a block
 * that actually straddles a page boundary. `lineHeights` come from cheap
 * getClientRects; `posOfLine` runs the expensive `posAtCoords` and is called
 * only for the lines that actually become break points (usually one), which
 * is what keeps a large document's remeasure affordable.
 */
export interface SplitInfo {
  lineHeights: number[];
  /** In-paragraph document position where line `i` starts, or null when the
   *  hit-test can't resolve one — the caller then treats the whole block as
   *  atomic (unsplittable) instead of breaking at a wrong position. */
  posOfLine: (i: number) => number | null;
}

export interface MeasuredBlock {
  /** ProseMirror position right before this top-level block. */
  offset: number;
  /** Rendered height in layout px (already zoom-normalized). */
  height: number;
  /** True for a manual page-break node -- forces whatever follows onto a
   *  fresh page regardless of room left on the current one. */
  isManualBreak: boolean;
  /** Present on splittable paragraphs; invoked only when the block straddles
   *  a boundary, to break it between lines (M2) instead of pushing it whole. */
  splitLines?: () => SplitInfo;
}

export interface PageBreakPoint {
  offset: number;
  pageNumber: number;
}

/**
 * Pure break-placement algorithm. Accumulates unit heights and starts a new
 * page before any unit that would overflow the printable height. A "unit" is
 * normally a whole block; a splittable paragraph that straddles a boundary is
 * expanded into its lines on demand (via `splitLines`) so the break can fall
 * between its lines (M2). `used > 0` guards the first unit of a page: an
 * oversized unit still gets its own page rather than an infinite run of empty
 * breaks. Kept free of live-DOM access (the measurement is injected through
 * `height`/`splitLines`) so it can be unit tested without a layout engine.
 */
export function computeBreakPoints(blocks: MeasuredBlock[], printable: number): PageBreakPoint[] {
  const points: PageBreakPoint[] = [];
  let used = 0;
  let pageNumber = 1;
  let forceBreakBefore = false;

  const breakBefore = (offset: number) => {
    pageNumber++;
    points.push({ offset, pageNumber });
    used = 0;
  };

  for (const block of blocks) {
    const straddles = used + block.height > printable;
    let split = false;
    if (block.splitLines && straddles && !block.isManualBreak) {
      // Tentative line-level split, committed only if every needed break
      // position resolves. A failed hit-test mid-paragraph must NOT emit a
      // break at a wrong position (e.g. the block boundary, after earlier
      // lines were already counted on the previous page) — the whole block
      // falls back to atomic below instead.
      const info = block.splitLines();
      const pending: PageBreakPoint[] = [];
      let u = used;
      let pn = pageNumber;
      let force = forceBreakBefore;
      let ok = true;
      for (let i = 0; i < info.lineHeights.length; i++) {
        const h = info.lineHeights[i];
        if (force || (u > 0 && u + h > printable)) {
          const pos = i === 0 ? block.offset : info.posOfLine(i);
          if (pos === null) {
            ok = false;
            break;
          }
          pn++;
          pending.push({ offset: pos, pageNumber: pn });
          u = 0;
        }
        force = false;
        u += h;
      }
      if (ok) {
        points.push(...pending);
        used = u;
        pageNumber = pn;
        forceBreakBefore = false;
        split = true;
      }
    }
    if (!split) {
      if (forceBreakBefore || (used > 0 && straddles)) breakBefore(block.offset);
      forceBreakBefore = false;
      used += block.height;
    }
    if (block.isManualBreak) forceBreakBefore = true;
  }

  return points;
}

interface ChromeContext {
  header: HeaderFooterSpec;
  footer: HeaderFooterSpec;
  chromeOnFirst: boolean;
  title: string;
  date: string;
  pages: number;
  margins: PageMargins;
}

/** Substitute the header/footer placeholders with concrete values. Unlike
 *  the print path (pdf.ts, which emits CSS counters that survive paged.js
 *  fragmentation), here the page numbers are literal -- the editor knows
 *  exactly which page each band belongs to. */
function resolveChrome(template: string, page: number, ctx: ChromeContext): string {
  return template
    .replace(/\{page\}/g, String(page))
    .replace(/\{pages\}/g, String(ctx.pages))
    .replace(/\{title\}/g, ctx.title)
    .replace(/\{date\}/g, ctx.date);
}

/** A header or footer row (left/center/right slots), or null when it should
 *  not show: suppressed on the first page, or entirely empty. */
function chromeRow(kind: "header" | "footer", spec: HeaderFooterSpec, page: number, ctx: ChromeContext): HTMLElement | null {
  if (page === 1 && !ctx.chromeOnFirst) return null;
  const slots = [spec.left, spec.center, spec.right].map((s) => resolveChrome(s, page, ctx));
  if (slots.every((s) => !s.trim())) return null;
  const row = document.createElement("div");
  row.className = `page-chrome page-chrome-${kind}`;
  row.title = kind === "header" ? "Cabeçalho (edite em Layout)" : "Rodapé (edite em Layout)";
  for (const text of slots) {
    const slot = document.createElement("span");
    slot.className = "page-chrome-slot";
    slot.textContent = text;
    row.appendChild(slot);
  }
  return row;
}

/** A white margin band (blends with the sheet), optionally holding a chrome
 *  row. `align` decides whether the row hugs the top (header, in a top
 *  margin) or bottom (footer, in a bottom margin) of the band. */
function marginBand(heightPx: number, align: "top" | "bottom", chrome: HTMLElement | null): HTMLElement {
  const band = document.createElement("div");
  band.className = `page-margin page-margin-${align}`;
  band.style.height = `${heightPx}px`;
  if (chrome) band.appendChild(chrome);
  return band;
}

function gapRoot(extraClass: string): HTMLElement {
  const el = document.createElement("div");
  el.className = `page-gap ${extraClass}`;
  el.contentEditable = "false";
  return el;
}

/** The full inter-sheet break between page N and page N+1: page N's bottom
 *  margin (with its footer), the bg gap, then page N+1's top margin (with
 *  its header). */
function betweenGap(offset: number, pageAbove: number, pageBelow: number, ctx: ChromeContext): Decoration {
  return Decoration.widget(
    offset,
    () => {
      const root = gapRoot("page-gap-between");
      root.appendChild(marginBand(ctx.margins.bottom, "bottom", chromeRow("footer", ctx.footer, pageAbove, ctx)));
      const sheetGap = document.createElement("div");
      sheetGap.className = "page-sheet-gap";
      sheetGap.style.height = `${SHEET_GAP_PX}px`;
      const label = document.createElement("span");
      label.className = "page-gap-label";
      label.textContent = `Página ${pageBelow}`;
      sheetGap.appendChild(label);
      root.appendChild(sheetGap);
      root.appendChild(marginBand(ctx.margins.top, "top", chromeRow("header", ctx.header, pageBelow, ctx)));
      return root;
    },
    { side: -1 }
  );
}

/** The top margin of page 1 (leading) -- a white band holding page 1's
 *  header. Provides the top margin that `.page` no longer pads in paginated
 *  mode. */
function leadingBand(ctx: ChromeContext): Decoration {
  return Decoration.widget(
    0,
    () => {
      const root = gapRoot("page-gap-edge");
      root.appendChild(marginBand(ctx.margins.top, "top", chromeRow("header", ctx.header, 1, ctx)));
      return root;
    },
    { side: -1 }
  );
}

/** The bottom margin of the last page (trailing) -- a white band holding the
 *  last page's footer. Provides the bottom margin that `.page` no longer
 *  pads in paginated mode. */
function trailingBand(pos: number, pageCount: number, ctx: ChromeContext): Decoration {
  return Decoration.widget(
    pos,
    () => {
      const root = gapRoot("page-gap-edge");
      root.appendChild(marginBand(ctx.margins.bottom, "bottom", chromeRow("footer", ctx.footer, pageCount, ctx)));
      return root;
    },
    { side: 1 }
  );
}

interface LineRect {
  top: number;
  bottom: number;
  left: number;
}

/**
 * The rendered line boxes of a textblock, grouped from the raw client rects
 * (one raw rect per inline run) into one entry per visual line. Rects that
 * overlap vertically belong to the same line -- handles mixed font sizes,
 * super/subscripts, inline math, etc.
 */
function paragraphLines(dom: HTMLElement): LineRect[] {
  const range = document.createRange();
  range.selectNodeContents(dom);
  const rects = Array.from(range.getClientRects()).filter((r) => r.height > 0);
  rects.sort((a, b) => a.top - b.top);
  const lines: LineRect[] = [];
  for (const r of rects) {
    const last = lines[lines.length - 1];
    if (last && r.top < last.bottom - 1) {
      last.top = Math.min(last.top, r.top);
      last.bottom = Math.max(last.bottom, r.bottom);
      last.left = Math.min(last.left, r.left);
    } else {
      lines.push({ top: r.top, bottom: r.bottom, left: r.left });
    }
  }
  return lines;
}

/**
 * Lazy line-split measurement for one paragraph (M2). Returns per-line
 * heights (from cheap getClientRects) and a `posOfLine` that resolves a
 * line's in-paragraph start position via `posAtCoords` -- the expensive part,
 * so it's deferred and only invoked for the lines that actually become break
 * points. Called only for paragraphs that straddle a page boundary, which is
 * what keeps a large document's remeasure fast (the profile without this was
 * ~2s on a 44-page doc; almost all of it was posAtCoords on every line).
 */
function measureSplit(view: EditorView, dom: HTMLElement, offset: number, blockHeight: number, zoomFactor: number): SplitInfo {
  const lines = paragraphLines(dom);
  if (lines.length <= 1) return { lineHeights: [blockHeight], posOfLine: () => offset };
  const box = dom.getBoundingClientRect();
  const lineHeights: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    // Height as the gap to the next line's top (last line runs to the block
    // bottom) so the line heights sum to the block height, keeping pagination
    // consistent with the cheap block-level pass.
    const nextTop = i + 1 < lines.length ? lines[i + 1].top : box.bottom;
    lineHeights.push((nextTop - lines[i].top) / zoomFactor);
  }
  return {
    lineHeights,
    posOfLine: (i) => {
      if (i === 0) return offset;
      const line = lines[i];
      const at = view.posAtCoords({ left: line.left + 1, top: (line.top + line.bottom) / 2 });
      // null when the hit-test misses (rare): computeBreakPoints then keeps
      // the paragraph atomic instead of breaking at a wrong position.
      return at ? at.pos : null;
    },
  };
}

/**
 * Where real page breaks fall, plus the per-page header/footer chrome. Two
 * passes: a cheap one measuring every top-level block's height
 * (getBoundingClientRect only), then -- inside computeBreakPoints -- a lazy
 * line-level pass (getClientRects + posAtCoords) for ONLY the paragraphs that
 * straddle a boundary. Heights are normalized by the current zoom: CSS `zoom`
 * (unlike `transform`) changes layout geometry itself, so
 * getBoundingClientRect() is already scaled and has to be divided back down,
 * or the break points drift as the user zooms.
 */
function buildPageBreakState(view: EditorView): PageBreakState {
  const { doc } = view.state;
  const settings = loadSettings();
  const layout = effectiveLayout(doc, settings);
  // "classic" is explicitly free-flow (see pageGeometry.ts) -- no fixed
  // page height, so there are no pages and no chrome.
  if (layout.pageFormat === "classic") return { decorations: DecorationSet.empty, pageCount: 1 };

  const printable = printableHeightPx(layout.pageFormat, layout.pageMargins);
  const zoomFactor = (settings.zoom || 100) / 100;

  // Measure the CLEAN content flow: neutralize the existing gap decorations
  // first. A mid-paragraph gap from the previous cycle sits INSIDE a
  // paragraph's box, so it would inflate that paragraph's measured height
  // and its line rects, destabilizing the break points cycle after cycle.
  const gaps = Array.from(view.dom.querySelectorAll<HTMLElement>(".page-gap"));
  const prevDisplay = gaps.map((g) => g.style.display);
  gaps.forEach((g) => {
    g.style.display = "none";
  });
  let points: PageBreakPoint[];
  try {
    // Cheap pass: one getBoundingClientRect per block. The line-level split
    // measurement is attached as a lazy `splitLines` closure that
    // computeBreakPoints invokes only when the block straddles a boundary.
    const blocks: MeasuredBlock[] = [];
    doc.forEach((node, offset) => {
      const dom = view.nodeDOM(offset) as HTMLElement | null;
      const isManualBreak = node.type.name === "pageBreak";
      if (!dom || dom.nodeType !== 1) {
        blocks.push({ offset, height: 0, isManualBreak });
        return;
      }
      const height = dom.getBoundingClientRect().height / zoomFactor;
      // Only plain paragraphs split by line; everything else stays atomic
      // (headings avoid orphan fragments; images/tables/lists can't split yet).
      const splitLines =
        node.type.name === "paragraph" ? () => measureSplit(view, dom, offset, height, zoomFactor) : undefined;
      blocks.push({ offset, height, isManualBreak, splitLines });
    });
    points = computeBreakPoints(blocks, printable);
  } finally {
    gaps.forEach((g, i) => {
      g.style.display = prevDisplay[i];
    });
  }

  const pageCount = points.length + 1;

  const ctx: ChromeContext = {
    header: layout.pageHeader,
    footer: layout.pageFooter,
    chromeOnFirst: layout.pageChromeOnFirst,
    title: (view.dom as HTMLElement).dataset.docTitle ?? "",
    date: new Date().toLocaleDateString(),
    pages: pageCount,
    margins: layout.pageMargins,
  };

  const decorations: Decoration[] = [leadingBand(ctx)];
  points.forEach((p, i) => decorations.push(betweenGap(p.offset, i + 1, i + 2, ctx)));
  decorations.push(trailingBand(doc.content.size, pageCount, ctx));

  return { decorations: DecorationSet.create(doc, decorations), pageCount };
}

/**
 * Real page breaks in the editor (Google Docs-style), as decorations over a
 * SINGLE ProseMirror document -- not separate editors/documents. "Page" is
 * purely a visual computed by this plugin; cursor, selection, undo history
 * and every other decoration stay exactly as they are on a continuous doc.
 * Each break also carries the page's header/footer chrome, so the vertical
 * margins live in these decorations (and `.page` drops its vertical padding
 * in paginated mode -- see App.tsx). See plano.md 12.2 for the architecture
 * decision and what is still deferred (line-level splitting M2, converging
 * with the print pipeline).
 */
export const PageBreaks = Extension.create({
  name: "pageBreaks",

  addProseMirrorPlugins() {
    return [
      new Plugin<PageBreakState>({
        key,
        state: {
          init: () => ({ decorations: DecorationSet.empty, pageCount: 1 }),
          apply(tr, old) {
            const meta = tr.getMeta(key) as PageBreakState | undefined;
            if (meta) return meta;
            return tr.docChanged ? { ...old, decorations: old.decorations.map(tr.mapping, tr.doc) } : old;
          },
        },
        props: {
          decorations(state) {
            return key.getState(state)?.decorations ?? DecorationSet.empty;
          },
        },
        view(editorView) {
          let timer = 0;
          const schedule = () => {
            if (timer) return;
            // setTimeout, not requestAnimationFrame: rAF is suspended by the
            // browser while the window is minimized/occluded/backgrounded,
            // which would leave page breaks stale until the next focus.
            // getBoundingClientRect() below forces a synchronous layout
            // regardless of an explicit paint, so the measurement is
            // accurate either way -- this only trades a little of rAF's
            // exactly-once-per-frame batching for reliability.
            timer = window.setTimeout(() => {
              timer = 0;
              const next = buildPageBreakState(editorView);
              editorView.dispatch(editorView.state.tr.setMeta(key, next));
            }, 0);
          };
          scheduleByView.set(editorView, schedule);
          // Catches window resizes, zoom (a CSS property on an ancestor,
          // not a ProseMirror transaction) and font-load reflows.
          const ro = new ResizeObserver(schedule);
          ro.observe(editorView.dom);
          schedule();
          return {
            update(view, prevState) {
              // Guards against the plugin re-triggering itself: the meta
              // transaction above carries no doc-changing steps, so
              // view.state.doc stays referentially identical and this
              // never re-schedules from its own dispatch.
              if (view.state.doc !== prevState.doc) schedule();
            },
            destroy() {
              ro.disconnect();
              scheduleByView.delete(editorView);
              if (timer) window.clearTimeout(timer);
            },
          };
        },
      }),
    ];
  },
});
