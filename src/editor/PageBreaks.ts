import { Extension } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorView } from "@tiptap/pm/view";
import { chromeRange, effectiveLayout } from "./DocLayout";
import { loadSettings } from "../lib/settings";
import type { HeaderFooterSpec, PageMargins } from "../lib/settings";
import { printableHeightPx } from "../lib/pageGeometry";
import { t } from "../lib/i18n";

interface PageBreakState {
  decorations: DecorationSet;
  /** Pages implied by the breaks below (breaks + 1); 1 for "classic" (no
   *  fixed page height, so this plugin has no opinion -- StatusBar keeps its
   *  own scrollHeight-based estimate for that format). */
  pageCount: number;
  /** The break points the decorations were built from, position-mapped
   *  through every transaction — a remeasure that lands on the SAME points
   *  skips the dispatch entirely, so the (expensive) widget re-render only
   *  happens when a break actually moved. Measured on a 223-page document:
   *  ~200ms per redraw, with ~2s spikes from re-laying-out 222 widgets. */
  points: PageBreakPoint[];
  /** Fingerprint of everything besides content that shapes the chrome
   *  (margins, header/footer templates, title, page count…) — a change here
   *  forces a redraw even when no break moved. */
  chromeKey: string;
}

const key = new PluginKey<PageBreakState>("pageBreaks");

// The bg-colored band between two sheets (over and above each page's own
// white top/bottom margins, which flank it).
const SHEET_GAP_PX = 28;

// view -> its remeasure trigger, so App can force a chrome recompute when
// something the plugin can't see in a transaction changes (the doc title,
// which drives {title} in the header/footer but lives on a DOM dataset).
const scheduleByView = new WeakMap<EditorView, () => void>();

/** Document offsets where the drawn page breaks sit (break BEFORE each
 *  offset). Lets the print pipeline map a node position to its page — the
 *  breaks are convergent with paged.js, so the mapping holds on paper. */
export function getBreakOffsets(state: EditorState): number[] {
  return (key.getState(state)?.points ?? []).map((p) => p.offset);
}

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
      //
      // Widow/orphan control (2/2, same contract the print engine applies —
      // see contentTypographyCss): a break never leaves a single line of the
      // paragraph alone at the bottom of a page (orphan → the paragraph
      // moves whole) nor a single final line alone on the next page (widow →
      // one more line moves with it). Without this the editor's greedy fill
      // and paged.js's fragmentation drift by one page as soon as a
      // paragraph's last line would land alone.
      const info = block.splitLines();
      const total = info.lineHeights.length;
      const lineSum = (from: number, to: number) => {
        let s = 0;
        for (let k = from; k < to; k++) s += info.lineHeights[k];
        return s;
      };
      const pending: PageBreakPoint[] = [];
      const usedAtBlockStart = used;
      let lastBreak = 0; // line index where the current page's chunk started
      let u = used;
      let pn = pageNumber;
      let force = forceBreakBefore;
      let ok = true;
      for (let i = 0; i < total; i++) {
        const h = info.lineHeights[i];
        if (force || (u > 0 && u + h > printable)) {
          let bi = i;
          // Widow: the remainder is a single line that fits — pull one more.
          if (total - bi === 1 && lineSum(bi, total) <= printable && bi - 1 > lastBreak) {
            bi -= 1;
          }
          // Orphan: the paragraph's first chunk would be a single line at
          // the bottom — push the whole block instead (only meaningful when
          // the paragraph didn't already start its page).
          if (lastBreak === 0 && pending.length === 0 && bi === 1 && usedAtBlockStart > 0) {
            bi = 0;
          }
          const pos = bi === 0 ? block.offset : info.posOfLine(bi);
          if (pos === null) {
            ok = false;
            break;
          }
          pn++;
          pending.push({ offset: pos, pageNumber: pn });
          lastBreak = bi;
          // Lines bi..i moved to the fresh page along with the current one.
          u = lineSum(bi, i);
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
  /** First physical page that shows chrome, and the number displayed there
   *  (editor/DocLayout.ts chromeRange — ABNT starts at 4 displaying "3"). */
  chromeFrom: number;
  numberStart: number;
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
  const shift = ctx.numberStart - ctx.chromeFrom;
  return template
    .replace(/\{page\}/g, String(page + shift))
    .replace(/\{pages\}/g, String(ctx.pages + shift))
    .replace(/\{title\}/g, ctx.title)
    .replace(/\{date\}/g, ctx.date);
}

/** A header or footer row (left/center/right slots), or null when it should
 *  not show: suppressed on pre-textual pages (before chromeFrom), or entirely
 *  empty. */
function chromeRow(kind: "header" | "footer", spec: HeaderFooterSpec, page: number, ctx: ChromeContext): HTMLElement | null {
  if (page < ctx.chromeFrom) return null;
  const slots = [spec.left, spec.center, spec.right].map((s) => resolveChrome(s, page, ctx));
  if (slots.every((s) => !s.trim())) return null;
  const row = document.createElement("div");
  row.className = `page-chrome page-chrome-${kind}`;
  row.title = kind === "header" ? t("page.headerEdit") : t("page.footerEdit");
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
      label.textContent = t("page.label", { n: pageBelow });
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
function measureSplit(
  view: EditorView,
  dom: HTMLElement,
  offset: number,
  outerHeight: number,
  boxHeight: number,
  zoomFactor: number
): SplitInfo {
  const lines = paragraphLines(dom);
  if (lines.length <= 1) return { lineHeights: [outerHeight], posOfLine: () => offset };
  const box = dom.getBoundingClientRect();
  const lineHeights: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    // Height as the gap to the next line's top (last line runs to the block
    // bottom) so the line heights sum to the box height, keeping pagination
    // consistent with the cheap block-level pass.
    const nextTop = i + 1 < lines.length ? lines[i + 1].top : box.bottom;
    lineHeights.push((nextTop - lines[i].top) / zoomFactor);
  }
  // The block-level pass counts the block's OUTER height (margins included);
  // attribute the difference to the first line so the line units sum to the
  // same total and the two passes can never disagree about page fill.
  lineHeights[0] += outerHeight - boxHeight;
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
  if (layout.pageFormat === "classic") {
    return { decorations: DecorationSet.empty, pageCount: 1, points: [], chromeKey: "classic" };
  }

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
    // Cheap pass: one getBoundingClientRect per block. A block's page-fill
    // height is the DELTA to the next block's top (not its own box height,
    // which excludes vertical margins — the `> * + *` gap and heading
    // margins are real page fill; leaving them out under-counted ~12px per
    // block and let the editor cram in more blocks per page than the PDF).
    // The delta also gets margin collapsing right for free. The last block
    // falls back to its box height (nothing below to measure against).
    const entries: { node: (typeof doc)["firstChild"] & object; offset: number; dom: HTMLElement | null; top: number; boxHeight: number }[] = [];
    doc.forEach((node, offset) => {
      const dom = view.nodeDOM(offset) as HTMLElement | null;
      if (!dom || dom.nodeType !== 1) {
        entries.push({ node, offset, dom: null, top: 0, boxHeight: 0 });
        return;
      }
      const box = dom.getBoundingClientRect();
      entries.push({ node, offset, dom, top: box.top, boxHeight: box.height });
    });

    // Containers whose direct children become independent break units, so a
    // page break can fall BETWEEN list items / quoted paragraphs instead of
    // pushing the whole container (which could overflow a page). Their
    // children stay atomic (no line-split inside containers), and a child's
    // own nested content is part of its unit. Tables stay atomic: a break
    // widget between <tr>s doesn't render meaningfully.
    const SPLITTABLE_CONTAINERS = new Set(["bulletList", "orderedList", "blockquote"]);

    const blocks: MeasuredBlock[] = [];
    entries.forEach((e, i) => {
      const isManualBreak = e.node.type.name === "pageBreak";
      if (!e.dom) {
        blocks.push({ offset: e.offset, height: 0, isManualBreak });
        return;
      }
      const next = entries[i + 1];
      const nextTop = next && next.dom ? next.top : e.top + e.boxHeight;
      const outerHeight = (nextTop - e.top) / zoomFactor;
      const dom = e.dom;
      const offset = e.offset;
      const boxHeight = e.boxHeight / zoomFactor;

      if (SPLITTABLE_CONTAINERS.has(e.node.type.name) && e.node.childCount > 1) {
        // Partition the container's page fill among its children: child i
        // runs to the next child's top; the first also absorbs the leading
        // edge (container top margin/padding) and the last runs to the next
        // top-level block (trailing padding + gap below). Sums to exactly
        // the container's outer height, so pagination totals stay
        // consistent with the atomic path.
        const kids: { offset: number; top: number }[] = [];
        e.node.forEach((_child, rel) => {
          const abs = offset + 1 + rel;
          const kdom = view.nodeDOM(abs) as HTMLElement | null;
          if (kdom && kdom.nodeType === 1) kids.push({ offset: abs, top: kdom.getBoundingClientRect().top });
        });
        if (kids.length > 1) {
          for (let k = 0; k < kids.length; k++) {
            const start = k === 0 ? e.top : kids[k].top;
            const end = k + 1 < kids.length ? kids[k + 1].top : nextTop;
            blocks.push({
              // Breaking before the first child = breaking before the container.
              offset: k === 0 ? offset : kids[k].offset,
              height: (end - start) / zoomFactor,
              isManualBreak: false,
            });
          }
          return;
        }
      }

      // Only plain paragraphs split by line; everything else stays atomic
      // (headings avoid orphan fragments; images/tables can't split yet).
      const splitLines =
        e.node.type.name === "paragraph"
          ? () => measureSplit(view, dom, offset, outerHeight, boxHeight, zoomFactor)
          : undefined;
      blocks.push({ offset, height: outerHeight, isManualBreak, splitLines });
    });
    points = computeBreakPoints(blocks, printable);
  } finally {
    gaps.forEach((g, i) => {
      g.style.display = prevDisplay[i];
    });
  }

  const pageCount = points.length + 1;

  const range = chromeRange(layout);
  const ctx: ChromeContext = {
    header: layout.pageHeader,
    footer: layout.pageFooter,
    chromeFrom: range.from,
    numberStart: range.startValue,
    title: (view.dom as HTMLElement).dataset.docTitle ?? "",
    date: new Date().toLocaleDateString(),
    pages: pageCount,
    margins: layout.pageMargins,
  };

  const decorations: Decoration[] = [leadingBand(ctx)];
  points.forEach((p, i) => decorations.push(betweenGap(p.offset, i + 1, i + 2, ctx)));
  decorations.push(trailingBand(doc.content.size, pageCount, ctx));

  return {
    decorations: DecorationSet.create(doc, decorations),
    pageCount,
    points,
    chromeKey: JSON.stringify([ctx.header, ctx.footer, ctx.chromeFrom, ctx.numberStart, ctx.title, ctx.date, ctx.margins, pageCount, layout.pageFormat]),
  };
}

/** Same break points and same chrome inputs -> redrawing the widgets would
 *  change nothing on screen; the ~200ms re-render (223-page doc) is skipped. */
function sameOutcome(a: PageBreakState, b: PageBreakState): boolean {
  if (a.chromeKey !== b.chromeKey || a.points.length !== b.points.length) return false;
  for (let i = 0; i < a.points.length; i++) {
    if (a.points[i].offset !== b.points[i].offset || a.points[i].pageNumber !== b.points[i].pageNumber) return false;
  }
  return true;
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
          init: () => ({ decorations: DecorationSet.empty, pageCount: 1, points: [], chromeKey: "" }),
          apply(tr, old) {
            const meta = tr.getMeta(key) as PageBreakState | undefined;
            if (meta) return meta;
            if (!tr.docChanged) return old;
            // Points map through the transaction like the decorations do, so
            // the skip-if-unchanged comparison stays fair after edits that
            // shift content without moving any break (the common case).
            return {
              ...old,
              decorations: old.decorations.map(tr.mapping, tr.doc),
              points: old.points.map((p) => ({ offset: tr.mapping.map(p.offset, -1), pageNumber: p.pageNumber })),
            };
          },
        },
        props: {
          decorations(state) {
            return key.getState(state)?.decorations ?? DecorationSet.empty;
          },
        },
        view(editorView) {
          let timer = 0;
          // Adaptive debounce: the remeasure re-runs at most ~every 1.5x its
          // own last cost (capped), so a small document updates near-
          // instantly while a 200-page one (measured ~155ms/cycle) settles at
          // a few refreshes per second instead of one per keystroke — typing
          // latency stays at the transaction cost, not transaction + measure.
          let lastCostMs = 0;
          const schedule = () => {
            if (timer) return;
            const delay = Math.min(400, Math.round(lastCostMs * 1.5));
            // setTimeout, not requestAnimationFrame: rAF is suspended by the
            // browser while the window is minimized/occluded/backgrounded,
            // which would leave page breaks stale until the next focus.
            // getBoundingClientRect() below forces a synchronous layout
            // regardless of an explicit paint, so the measurement is
            // accurate either way -- this only trades a little of rAF's
            // exactly-once-per-frame batching for reliability.
            timer = window.setTimeout(() => {
              timer = 0;
              const t0 = performance.now();
              const next = buildPageBreakState(editorView);
              lastCostMs = performance.now() - t0;
              const cur = key.getState(editorView.state);
              // Same breaks, same chrome -> nothing on screen would change;
              // skip the dispatch and the widget re-render it would cause.
              if (cur && sameOutcome(cur, next)) return;
              editorView.dispatch(editorView.state.tr.setMeta(key, next));
            }, delay);
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
