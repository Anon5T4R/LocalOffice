import type { Editor } from "@tiptap/react";

// What happens to the model's answer once it's ready.
export type ResultMode = "replace" | "insert" | "show";

export interface SelectionAction {
  id: string;
  label: string;
  mode: ResultMode;
  /** System prompt; `arg` carries an extra parameter (e.g. target language). */
  system: (arg?: string) => string;
}

const ONLY = "Responda apenas com o resultado, sem comentários nem aspas.";

// Actions that operate on the selected text (fired from the bubble menu).
export const SELECTION_ACTIONS: Record<string, SelectionAction> = {
  rewrite: {
    id: "rewrite",
    label: "Reescrever",
    mode: "replace",
    system: () => `Reescreva o texto a seguir em português, com mais clareza e fluidez, mantendo o sentido. ${ONLY}`,
  },
  review: {
    id: "review",
    label: "Revisar",
    mode: "replace",
    system: () => `Corrija gramática, ortografia e pontuação do texto a seguir em português, mudando o mínimo. ${ONLY}`,
  },
  bullets: {
    id: "bullets",
    label: "Virar tópicos",
    mode: "replace",
    system: () => `Reescreva o conteúdo a seguir como uma lista de tópicos concisos em português, um por linha começando com "- ". ${ONLY}`,
  },
  summarize: {
    id: "summarize",
    label: "Resumir trecho",
    mode: "show",
    system: () => `Resuma o texto a seguir em português, de forma concisa e fiel.`,
  },
  continue: {
    id: "continue",
    label: "Continuar",
    mode: "insert",
    system: () => `Continue escrevendo a partir do texto a seguir, em português, mantendo estilo e tom. Não repita o texto dado; escreva apenas a continuação.`,
  },
  translate: {
    id: "translate",
    label: "Traduzir",
    mode: "replace",
    system: (lang) => `Traduza o texto a seguir para ${lang || "inglês"}. ${ONLY}`,
  },
  tone: {
    id: "tone",
    label: "Mudar tom",
    mode: "replace",
    system: (tone) => `Reescreva o texto a seguir em português com tom ${tone || "formal"}, mantendo o sentido. ${ONLY}`,
  },
};

export const TRANSLATE_LANGS = ["Inglês", "Espanhol", "Francês", "Alemão", "Italiano", "Português"];
export const TONES = ["formal", "informal"];

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
