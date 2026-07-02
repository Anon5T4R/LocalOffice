import type { PageFormat, PageMargins } from "./settings";

/**
 * Page geometry shared by the on-screen page div (App.tsx), the live page
 * count (StatusBar) and the print/PDF pipeline (pdf.ts) — previously spread
 * across three independently-maintained tables that had already drifted
 * (StatusBar's "classic" height didn't match the A4 size pdf.ts prints it as).
 *
 * `widthCss`/`printSizeCss` are CSS length strings (mm) — CSS accepts mm
 * natively, so the same value both sizes the on-screen `.page` div and the
 * printed `@page`. `fullHeightPx` is the 96dpi pixel equivalent of the page
 * height, used only for the on-screen height-based page-count estimate
 * (StatusBar measures `scrollHeight`, which is in px).
 *
 * "classic" is free-flow on screen (no fixed page height) but prints as A4
 * (see `printSizeCss` below), so its estimate divisor is A4's, not some
 * independent notional value.
 */
export interface PageSize {
  /** CSS width of the on-screen `.page` div. */
  widthCss: string;
  /** CSS `size` for `@page` when printing. */
  printSizeCss: string;
  /** 96dpi pixel height of a full page, for on-screen estimates. */
  fullHeightPx: number;
}

export const PAGE_SIZES: Record<PageFormat, PageSize> = {
  classic: { widthCss: "760px", printSizeCss: "210mm 297mm", fullHeightPx: 1123 },
  a4: { widthCss: "210mm", printSizeCss: "210mm 297mm", fullHeightPx: 1123 },
  a5: { widthCss: "148mm", printSizeCss: "148mm 210mm", fullHeightPx: 794 },
  letter: { widthCss: "215.9mm", printSizeCss: "215.9mm 279.4mm", fullHeightPx: 1056 },
  a3: { widthCss: "297mm", printSizeCss: "297mm 420mm", fullHeightPx: 1587 },
};

export const DEFAULT_MARGINS: PageMargins = { top: 56, bottom: 56, left: 72, right: 72 };

/** Printable height in px for a page format with the given margins. */
export function printableHeightPx(format: PageFormat, margins: PageMargins): number {
  return PAGE_SIZES[format].fullHeightPx - margins.top - margins.bottom;
}

/**
 * Estimate how many printed pages `contentPx` (the editor's on-screen
 * `scrollHeight`) would fill. `zoomFactor` compensates for the CSS `zoom`
 * applied to the editor's ancestor container, which scales `scrollHeight`
 * in this WebView.
 */
export function estimatePages(
  contentPx: number,
  format: PageFormat,
  margins: PageMargins,
  zoomFactor: number
): number {
  const printablePx = printableHeightPx(format, margins) * zoomFactor;
  return Math.max(1, Math.ceil(contentPx / printablePx));
}
