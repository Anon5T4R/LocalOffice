import type { Editor } from "@tiptap/react";
import { t, type MessageKey } from "../lib/i18n";

// What happens to the model's answer once it's ready.
export type ResultMode = "replace" | "insert" | "show";

export interface SelectionAction {
  id: string;
  /** i18n key of the label shown in the panel message. */
  labelKey: MessageKey;
  mode: ResultMode;
  /** System prompt; `arg` carries an extra parameter (e.g. target language).
   *  Resolved through t() at call time, so it follows the UI language (the AI
   *  answers in the UI language) and never goes stale on a locale change. */
  system: (arg?: string) => string;
}

const only = () => t("aiSys.only");

// Actions that operate on the selected text (fired from the bubble menu).
export const SELECTION_ACTIONS: Record<string, SelectionAction> = {
  rewrite: {
    id: "rewrite",
    labelKey: "aiAct.rewrite",
    mode: "replace",
    system: () => t("aiSys.rewrite", { only: only() }),
  },
  review: {
    id: "review",
    labelKey: "aiAct.review",
    mode: "replace",
    system: () => t("aiSys.review", { only: only() }),
  },
  bullets: {
    id: "bullets",
    labelKey: "aiAct.bullets",
    mode: "replace",
    system: () => t("aiSys.bullets", { only: only() }),
  },
  summarize: {
    id: "summarize",
    labelKey: "aiAct.summarize",
    mode: "show",
    system: () => t("aiSys.summarize"),
  },
  continue: {
    id: "continue",
    labelKey: "aiAct.continue",
    mode: "insert",
    system: () => t("aiSys.continue"),
  },
  translate: {
    id: "translate",
    labelKey: "aiAct.translate",
    mode: "replace",
    system: (lang) => t("aiSys.translate", { lang: lang || t("aiLang.en"), only: only() }),
  },
  tone: {
    id: "tone",
    labelKey: "aiAct.tone",
    mode: "replace",
    system: (tone) => t("aiSys.tone", { tone: tone || t("aiTone.formal"), only: only() }),
  },
};

/** Target languages for the translate action (localized; factory so it follows
 *  the UI language on remount instead of freezing at module-load time). */
export function translateLangs(): string[] {
  return [t("aiLang.en"), t("aiLang.es"), t("aiLang.fr"), t("aiLang.de"), t("aiLang.it"), t("aiLang.pt")];
}

/** Tones for the change-tone action (localized factory, same reason). */
export function tones(): string[] {
  return [t("aiTone.formal"), t("aiTone.informal")];
}

// Rough token estimate (~4 chars/token) — good enough to warn before truncation.
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Split the document into chunks that each fit `maxChars`, breaking preferably at
 * headings. Used by the whole-document summary (map-reduce). Falls back to packing
 * paragraphs when there are no headings.
 *
 * Yields to the event loop every 100 blocks to avoid blocking the UI on large docs.
 */
export async function chunkDocument(editor: Editor, maxChars: number): Promise<string[]> {
  const blocks: { heading: boolean; text: string }[] = [];
  editor.state.doc.forEach((node) => {
    const text = node.textContent.trim();
    if (text) blocks.push({ heading: node.type.name === "heading", text });
  });

  const chunks: string[] = [];
  let cur = "";
  for (let i = 0; i < blocks.length; i++) {
    if (i > 0 && i % 100 === 0) {
      await new Promise<void>((r) => setTimeout(r, 0));
    }
    const b = blocks[i];
    const piece = (b.heading ? "\n## " : "") + b.text;
    if (cur && (cur.length + piece.length > maxChars || (b.heading && cur.length > maxChars * 0.5))) {
      chunks.push(cur.trim());
      cur = "";
    }
    if (piece.length > maxChars) {
      for (let j = 0; j < piece.length; j += maxChars) chunks.push(piece.slice(j, j + maxChars).trim());
    } else {
      cur += (cur ? "\n\n" : "") + piece;
    }
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks.length ? chunks : [editor.getText()];
}
