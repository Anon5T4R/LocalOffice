// Caption numbering, shared by the editor decorations (editor/Caption.ts) and
// the print/export baking (pdf.ts, document.ts) so both always produce
// identical numbers — the same contract HeadingNumbers has.

export const CAPTION_LABELS = { figure: "Figura", table: "Tabela" } as const;
export type CaptionKind = keyof typeof CAPTION_LABELS;

export interface CaptionEntry {
  kind: CaptionKind;
  /** "Figura 3" */
  label: string;
  /** Caption text without the label. */
  text: string;
  /** Anchor id assigned to the caption element. */
  id: string;
  /** Persistent cross-reference id (data-ref-id), when the caption has one. */
  refId: string | null;
}

export function captionKindOf(value: string | null): CaptionKind {
  return value === "table" ? "table" : "figure";
}

/**
 * Number every caption paragraph in `doc` in document order, assign anchor
 * ids and prepend the baked "Figura N — " label. Returns the entries so the
 * print pipeline can build figure/table lists from them. The label span is
 * marked (`data-baked-caption-num`) so reimport paths could strip it.
 */
export function bakeCaptionsInto(doc: Document): CaptionEntry[] {
  const counts: Record<CaptionKind, number> = { figure: 0, table: 0 };
  const entries: CaptionEntry[] = [];
  doc.querySelectorAll("p[data-caption]").forEach((p, i) => {
    const kind = captionKindOf(p.getAttribute("data-caption"));
    const label = `${CAPTION_LABELS[kind]} ${++counts[kind]}`;
    if (!p.id) p.id = `cap-${kind}-${i}`;
    const text = p.textContent ?? "";
    const span = doc.createElement("span");
    span.setAttribute("data-baked-caption-num", "");
    span.textContent = `${label} — `;
    p.prepend(span);
    entries.push({ kind, label, text, id: p.id, refId: p.getAttribute("data-ref-id") });
  });
  return entries;
}

/** String-in/string-out wrapper for the export path (DOCX/ODT/RTF). */
export function bakeCaptionNumbers(html: string): string {
  if (!html.includes("data-caption")) return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  bakeCaptionsInto(doc);
  return doc.body.innerHTML;
}
