import { useEffect, useState, useSyncExternalStore } from "react";
import { useEditorState } from "@tiptap/react";
import { estimatePages } from "../lib/pageGeometry";
import { getTabSaveStatus, subscribeTabSaveStatus } from "../lib/saveStatusStore";
import { effectiveLayout } from "./DocLayout";
import { getPageCount } from "./PageBreaks";
import { useSettings } from "../state/SettingsContext";
import { useEditorInstance } from "../state/EditorContext";

const WORDS_PER_MINUTE = 200;

function countWords(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

interface StatusBarProps {
  onZoomChange: (z: number) => void;
  activeTabId: string;
}

export function StatusBar({ onZoomChange, activeTabId }: StatusBarProps) {
  const editor = useEditorInstance();
  const { settings } = useSettings();
  // Subscribed directly (instead of a prop threaded through App) so a save
  // transition only re-renders StatusBar, not the whole app tree.
  const saveStatus = useSyncExternalStore(subscribeTabSaveStatus, () => getTabSaveStatus(activeTabId));
  const { pageFormat, pageMargins: margins } = effectiveLayout(editor.state.doc, settings);
  const zoom = settings.zoom || 100;
  const wordGoal = settings.wordGoal || 0;
  const { words, chars, charsNoSpaces, paragraphs, pageBreakPages, selWords, selChars } = useEditorState({
    editor,
    selector: ({ editor }) => {
      const text = editor.getText();
      let paragraphs = 0;
      editor.state.doc.descendants((n) => {
        if ((n.type.name === "paragraph" || n.type.name === "heading") && n.textContent.trim()) paragraphs += 1;
      });
      const { from, to, empty } = editor.state.selection;
      const selText = empty ? "" : editor.state.doc.textBetween(from, to, " ");
      return {
        words: countWords(text),
        chars: text.replace(/\n/g, "").length,
        charsNoSpaces: text.replace(/\s/g, "").length,
        paragraphs,
        // Authoritative for paginated formats: the exact count the page-gap
        // decorations were drawn from (editor/PageBreaks.ts). "classic" has
        // no fixed page height, so this is always 1 there -- heightPages
        // below (scrollHeight/printable) is what classic actually uses.
        pageBreakPages: getPageCount(editor.state),
        selWords: countWords(selText),
        selChars: selText.replace(/\n/g, "").length,
      };
    },
  });

  const [heightPages, setHeightPages] = useState(1);
  const zoomFactor = (settings.zoom || 100) / 100;

  useEffect(() => {
    const el = editor.view.dom as HTMLElement;
    // el.scrollHeight is measured inside the ancestor that carries the CSS
    // `zoom` (App.tsx's .pages-container) and scales with it in this
    // WebView — estimatePages compensates so the count doesn't change
    // just because the user zoomed in or out. Only actually used for
    // "classic" (see `pages` below) -- scrollHeight includes the page-gap
    // decorations' own height for paginated formats, which would overcount.
    const measure = () => setHeightPages(estimatePages(el.scrollHeight, pageFormat, margins, zoomFactor));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [editor, pageFormat, margins, zoomFactor]);

  const pages = pageFormat === "classic" ? heightPages : pageBreakPages;
  const readMin = Math.max(1, Math.round(words / WORDS_PER_MINUTE));

  return (
    <div className="status-bar">
      <span title="Estimativa baseada na altura do conteúdo">
        ~{pages} página{pages > 1 ? "s" : ""}
      </span>
      {selWords > 0 ? (
        <span title="Seleção">{selWords} de {words} palavra{words === 1 ? "" : "s"} · {selChars} caractere{selChars === 1 ? "" : "s"}</span>
      ) : (
        <span title={`${charsNoSpaces} caracteres sem espaços · ${paragraphs} parágrafo${paragraphs === 1 ? "" : "s"}`}>
          {words} palavra{words === 1 ? "" : "s"} · {chars} caractere{chars === 1 ? "" : "s"}
        </span>
      )}
      <span title="Tempo de leitura estimado (~200 palavras/min)">{readMin} min de leitura</span>
      {saveStatus.kind === "error" && (
        <span className="status-save-error" title={saveStatus.message}>
          ⚠ Falha ao salvar automaticamente — Ctrl+S para tentar de novo
        </span>
      )}
      {saveStatus.kind === "saving" && <span className="status-saving">Salvando…</span>}
      {saveStatus.kind === "saved" && (
        <span className="status-saved" title="Última gravação em disco bem-sucedida">
          Salvo às {new Date(saveStatus.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
        </span>
      )}
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
