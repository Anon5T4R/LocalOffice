import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorView } from "@tiptap/pm/view";
import { effectiveLayout } from "./DocLayout";
import { loadSettings } from "../lib/settings";
import { printableHeightPx } from "../lib/pageGeometry";

interface PageBreakState {
  decorations: DecorationSet;
  /** Pages implied by the breaks below (breaks + 1); 1 for "classic" (no
   *  fixed page height, so this plugin has no opinion -- StatusBar keeps its
   *  own scrollHeight-based estimate for that format). */
  pageCount: number;
}

const key = new PluginKey<PageBreakState>("pageBreaks");

// Visual gap between two "sheets" in the continuous view, on top of each
// page's own margins (so the reader sees the bottom margin of page N, a
// gap, then the top margin of page N+1 -- not just abutted content).
const VISUAL_GAP_PX = 28;

/** Current page count, for StatusBar to show a number consistent with the
 *  breaks actually drawn (not an independent scrollHeight/printable guess,
 *  which would drift once the gap decorations themselves add height). */
export function getPageCount(state: EditorState): number {
  return key.getState(state)?.pageCount ?? 1;
}

export interface MeasuredBlock {
  /** ProseMirror position right before this top-level block. */
  offset: number;
  /** Rendered height in layout px (already zoom-normalized). */
  height: number;
  /** True for a manual page-break node -- forces whatever follows onto a
   *  fresh page regardless of room left on the current one. */
  isManualBreak: boolean;
}

export interface PageBreakPoint {
  offset: number;
  pageNumber: number;
}

/**
 * Pure break-placement algorithm (block granularity -- M1 of the plan; a
 * block that doesn't fit starts the next page whole, never split mid-block.
 * Line-level splitting is M2, tracked separately). Kept free of DOM/PM-view
 * access so it can be unit tested without a real layout engine -- the DOM
 * measurement lives in buildPageBreakState below.
 */
export function computeBreakPoints(blocks: MeasuredBlock[], printable: number): PageBreakPoint[] {
  const points: PageBreakPoint[] = [];
  let used = 0;
  let pageNumber = 1;
  let forceBreakBefore = false;

  for (const block of blocks) {
    const mustBreak = forceBreakBefore;
    forceBreakBefore = block.isManualBreak;

    // `used > 0` guards the very first block of a page: an oversized block
    // (taller than one page) still gets its own page rather than an
    // infinite run of empty breaks -- it just overflows visually. M1 does
    // not split content mid-block.
    if (mustBreak || (used > 0 && used + block.height > printable)) {
      pageNumber++;
      points.push({ offset: block.offset, pageNumber });
      used = 0;
    }
    used += block.height;
  }

  return points;
}

/**
 * Where real page breaks fall. Reads rendered heights straight from the DOM
 * (view.nodeDOM), normalized by the current zoom -- CSS `zoom` (unlike
 * `transform`) changes layout geometry itself, so getBoundingClientRect() is
 * already scaled and has to be divided back down, or the break points drift
 * as the user zooms.
 */
function buildPageBreakState(view: EditorView): PageBreakState {
  const { doc } = view.state;
  const settings = loadSettings();
  const layout = effectiveLayout(doc, settings);
  // "classic" is explicitly free-flow (see pageGeometry.ts) -- no fixed
  // page height, so there is nothing to break.
  if (layout.pageFormat === "classic") return { decorations: DecorationSet.empty, pageCount: 1 };

  const printable = printableHeightPx(layout.pageFormat, layout.pageMargins);
  const zoomFactor = (settings.zoom || 100) / 100;
  const gapPx = layout.pageMargins.bottom + VISUAL_GAP_PX + layout.pageMargins.top;

  const blocks: MeasuredBlock[] = [];
  doc.forEach((node, offset) => {
    const dom = view.nodeDOM(offset) as HTMLElement | null;
    const height = dom ? dom.getBoundingClientRect().height / zoomFactor : 0;
    blocks.push({ offset, height, isManualBreak: node.type.name === "pageBreak" });
  });

  const points = computeBreakPoints(blocks, printable);
  const decorations = points.map((p) => pageGapDecoration(p.offset, p.pageNumber, gapPx));
  return {
    decorations: DecorationSet.create(doc, decorations),
    pageCount: points.length + 1,
  };
}

function pageGapDecoration(pos: number, pageNumber: number, gapPx: number): Decoration {
  return Decoration.widget(
    pos,
    () => {
      const el = document.createElement("div");
      el.className = "page-gap";
      el.contentEditable = "false";
      el.style.height = `${gapPx}px`;
      const label = document.createElement("span");
      label.className = "page-gap-label";
      label.textContent = `Página ${pageNumber}`;
      el.appendChild(label);
      return el;
    },
    { side: -1 }
  );
}

/**
 * Real page breaks in the editor (Google Docs-style), as decorations over a
 * SINGLE ProseMirror document -- not separate editors/documents. "Page" is
 * purely a visual computed by this plugin; cursor, selection, undo history
 * and every other decoration stay exactly as they are on a continuous doc.
 * See plano.md 12.2 for the architecture decision and what M1 explicitly
 * does not attempt yet (line-level splitting, in-editor header/footer
 * chrome, converging with the print pipeline).
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
              if (timer) window.clearTimeout(timer);
            },
          };
        },
      }),
    ];
  },
});
