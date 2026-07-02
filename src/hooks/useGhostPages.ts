import { useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import type { PageFormat, PageMargins } from "../lib/settings";

/**
 * Page boundaries measured from the real block layout: a new page starts at
 * the first block that doesn't fit the current one, or right after a manual
 * page break. Blocks taller than a whole page are sliced at page height
 * (mid-paragraph, like any word processor). Offsets are Y positions in the
 * editor's (zoomed) coordinate space where each new page begins.
 */
export function measurePageOffsets(el: HTMLElement, pageH: number): number[] {
  const rect = el.getBoundingClientRect();
  const offsets: number[] = [];
  let pageStart = 0;
  for (const child of Array.from(el.children) as HTMLElement[]) {
    const r = child.getBoundingClientRect();
    const top = r.top - rect.top;
    const bottom = r.bottom - rect.top;

    if (child.hasAttribute("data-page-break")) {
      offsets.push(bottom);
      pageStart = bottom;
      continue;
    }
    if (bottom - pageStart <= pageH) continue;

    // Snap the boundary to the block's start when it fits on the next page.
    if (top > pageStart && bottom - top <= pageH) {
      offsets.push(top);
      pageStart = top;
      continue;
    }
    // Oversized block: slice it at page height.
    if (top > pageStart) {
      offsets.push(top);
      pageStart = top;
    }
    while (bottom - pageStart > pageH) {
      pageStart += pageH;
      offsets.push(pageStart);
    }
  }
  return offsets;
}

interface GhostPagesConfig {
  isPaginated: boolean;
  pageFormat: PageFormat;
  /** Full sheet height in px (Infinity in classic mode). */
  pageHeightPx: number;
  pageMargins: PageMargins;
  zoomFactor: number;
}

/**
 * Ghost pages: measure page boundaries (manual breaks + overflow) and mirror
 * the content into fixed-size ghost pages. Each ghost mirrors one printed
 * page: `top` is the content offset where the page starts, `height` the slice
 * it shows (so the next page's first block never peeks at the bottom). Both
 * are in unzoomed content px. Re-measures on mount/format change and on
 * content resize, coalesced via rAF — ResizeObserver fires in bursts while
 * typing and editor.getHTML() serializes the whole doc, so once per frame max.
 */
export function useGhostPages(
  editor: Editor | null,
  { isPaginated, pageFormat, pageHeightPx, pageMargins, zoomFactor }: GhostPagesConfig
) {
  const [ghostPages, setGhostPages] = useState<{ top: number; height: number }[]>([]);
  const [ghostHtml, setGhostHtml] = useState("");

  useEffect(() => {
    if (!editor || !isPaginated) {
      setGhostPages([]);
      setGhostHtml("");
      return;
    }
    const el = editor.view.dom;
    let raf = 0;
    const measure = () => {
      raf = 0;
      // A page only fits its *printable* height — the page minus its margins,
      // not the whole sheet. Measuring against the full sheet is what dropped
      // a margin's worth of content at every page seam.
      const printableH = pageHeightPx - pageMargins.top - pageMargins.bottom;
      // measurePageOffsets works in the zoomed coordinate space of
      // getBoundingClientRect, so scale the target up; then normalize the
      // results back to unzoomed px so the ghost transforms match the mm-sized
      // page frames (which the container's CSS zoom scales uniformly).
      const offsets = measurePageOffsets(el, printableH * zoomFactor).map((o) => o / zoomFactor);
      const docH = el.getBoundingClientRect().height / zoomFactor;
      const pages = offsets.map((top, i) => ({ top, height: (offsets[i + 1] ?? docH) - top }));
      setGhostPages(pages);
      setGhostHtml(editor.getHTML());
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    schedule();
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [editor, pageFormat, pageHeightPx, isPaginated, zoomFactor, pageMargins.top, pageMargins.bottom]);

  return { ghostPages, ghostHtml };
}
