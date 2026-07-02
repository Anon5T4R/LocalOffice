import { useEffect, useState } from "react";
import { useEditorState } from "@tiptap/react";
import { SaveStatus } from "../lib/tabs";
import { useSettings } from "../state/SettingsContext";
import { useEditorInstance } from "../state/EditorContext";

const PAGE_HEIGHT_PX: Record<string, number> = {
  classic: 980,
  a4: 1123,
  a5: 794,
  letter: 1056,
  a3: 1587,
};

const WORDS_PER_MINUTE = 200;

function countWords(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

interface StatusBarProps {
  onZoomChange: (z: number) => void;
  /** Exact count from the measured ghost pages; when absent we estimate. */
  measuredPages?: number;
  /** Autosave/save pipeline state; errors stay visible until a save succeeds. */
  saveStatus?: SaveStatus;
}

export function StatusBar({ onZoomChange, measuredPages, saveStatus }: StatusBarProps) {
  const editor = useEditorInstance();
  const { settings } = useSettings();
  const pageFormat = settings.pageFormat || "classic";
  const zoom = settings.zoom || 100;
  const zoomFactor = zoom / 100;
  const wordGoal = settings.wordGoal || 0;
  const { words, chars, charsNoSpaces, paragraphs, breaks, selWords, selChars } = useEditorState({
    editor,
    selector: ({ editor }) => {
      const text = editor.getText();
      let breaks = 0;
      let paragraphs = 0;
      editor.state.doc.descendants((n) => {
        if (n.type.name === "pageBreak") breaks += 1;
        if ((n.type.name === "paragraph" || n.type.name === "heading") && n.textContent.trim()) paragraphs += 1;
      });
      const { from, to, empty } = editor.state.selection;
      const selText = empty ? "" : editor.state.doc.textBetween(from, to, " ");
      return {
        words: countWords(text),
        chars: text.replace(/\n/g, "").length,
        charsNoSpaces: text.replace(/\s/g, "").length,
        paragraphs,
        breaks,
        selWords: countWords(selText),
        selChars: selText.replace(/\n/g, "").length,
      };
    },
  });

  const [heightPages, setHeightPages] = useState(1);
  // scrollHeight scales with the ancestor CSS zoom; scale the page height to match.
  const pagePx = (PAGE_HEIGHT_PX[pageFormat] || 980) * zoomFactor;

  useEffect(() => {
    const el = editor.view.dom as HTMLElement;
    const measure = () => setHeightPages(Math.max(1, Math.ceil(el.scrollHeight / pagePx)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [editor, pagePx]);

  const pages = measuredPages ?? Math.max(heightPages, breaks + 1);
  const readMin = Math.max(1, Math.round(words / WORDS_PER_MINUTE));

  return (
    <div className="status-bar">
      <span title={measuredPages ? "Contagem medida pelo layout das páginas" : "Estimativa baseada na altura do conteúdo"}>
        {measuredPages ? "" : "~"}{pages} página{pages > 1 ? "s" : ""}
      </span>
      {selWords > 0 ? (
        <span title="Seleção">{selWords} de {words} palavra{words === 1 ? "" : "s"} · {selChars} caractere{selChars === 1 ? "" : "s"}</span>
      ) : (
        <span title={`${charsNoSpaces} caracteres sem espaços · ${paragraphs} parágrafo${paragraphs === 1 ? "" : "s"}`}>
          {words} palavra{words === 1 ? "" : "s"} · {chars} caractere{chars === 1 ? "" : "s"}
        </span>
      )}
      <span title="Tempo de leitura estimado (~200 palavras/min)">{readMin} min de leitura</span>
      {saveStatus?.kind === "error" && (
        <span className="status-save-error" title={saveStatus.message}>
          ⚠ Falha ao salvar automaticamente — Ctrl+S para tentar de novo
        </span>
      )}
      {saveStatus?.kind === "saving" && <span className="status-saving">Salvando…</span>}
      {wordGoal ? (
        <span
          className={"status-goal" + (words >= wordGoal ? " is-done" : "")}
          title={`Meta de palavras: ${wordGoal} (configurável em ⚙)`}
        >
          🎯 {Math.min(100, Math.round((words / wordGoal) * 100))}%
        </span>
      ) : null}
      <span className="status-zoom">
        <button type="button" className="status-zoom-btn" onClick={() => onZoomChange(zoom - 10)} title="Diminuir zoom (Ctrl −)">−</button>
        <button type="button" className="status-zoom-val" onClick={() => onZoomChange(100)} title="Restaurar zoom (Ctrl 0)">{zoom}%</button>
        <button type="button" className="status-zoom-btn" onClick={() => onZoomChange(zoom + 10)} title="Aumentar zoom (Ctrl +)">+</button>
      </span>
    </div>
  );
}
