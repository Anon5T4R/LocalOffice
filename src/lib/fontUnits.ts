/**
 * Font-size units: the UI speaks POINTS (a convenção dos editores de texto —
 * ABNT/APA "fonte 12" significa 12pt), mas toda métrica interna — marks,
 * estilos do documento, medição de página, print — permanece em px, a unidade
 * que o motor de layout inteiro já usa. 1pt = 4/3 px exatos (CSS: 96dpi/72pt).
 * A conversão acontece SÓ na borda da UI (HomeTab "Tam.", StylesModal).
 */

/** Points -> px, rounded to 2 decimals (12pt -> 16, 11pt -> 14.67). */
export function ptToPx(pt: number): number {
  return Math.round(((pt * 4) / 3) * 100) / 100;
}

/** Px -> points, rounded to 2 decimals (16px -> 12; 14.67px -> 11). */
export function pxToPt(px: number): number {
  return Math.round(px * 0.75 * 100) / 100;
}

/**
 * A CSS font-size ("16px", "12pt") as points for the size inputs, or null
 * when empty/unparseable. Unsuffixed numbers are treated as px (the app's
 * legado: marks gravados antes da UI falar pt).
 */
export function cssSizeToPt(size: string | null | undefined): number | null {
  if (!size) return null;
  const n = parseFloat(size);
  if (Number.isNaN(n)) return null;
  return /pt\s*$/.test(size) ? n : pxToPt(n);
}
