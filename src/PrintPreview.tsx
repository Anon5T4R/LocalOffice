import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PrintOptions, cleanupPaged, printLegacy, renderPaged } from "./lib/pdf";
import { useFocusTrap } from "./hooks/useFocusTrap";

interface PrintPreviewProps {
  html: string;
  options: PrintOptions;
  onClose: () => void;
}

type PreviewState =
  | { status: "rendering"; pagesSoFar: number }
  | { status: "ready"; pages: number }
  | { status: "error"; message: string };

/**
 * Print preview: paginates the document with paged.js and prints exactly what
 * is shown. Rendered through a portal (outside .app) so the print stylesheet
 * can hide the app and keep only the pages.
 */
export function PrintPreview({ html, options, onClose }: PrintPreviewProps) {
  const pagesRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<PreviewState>({ status: "rendering", pagesSoFar: 0 });

  useFocusTrap(rootRef);

  useEffect(() => {
    const container = pagesRef.current;
    if (!container) return;
    let cancelled = false;

    setState({ status: "rendering", pagesSoFar: 0 });
    renderPaged(html, container, options, (pagesSoFar) => {
      if (!cancelled) setState({ status: "rendering", pagesSoFar });
    })
      .then((pages) => {
        if (!cancelled) setState({ status: "ready", pages });
      })
      .catch((e) => {
        console.error("print preview:", e);
        if (!cancelled) setState({ status: "error", message: String(e) });
      });

    return () => {
      cancelled = true;
      cleanupPaged(container);
    };
  }, [html, options]);

  // Esc closes, like the other modals.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const fallback = () => {
    onClose();
    printLegacy(html, options);
  };

  return createPortal(
    <div ref={rootRef} className="print-preview" role="dialog" aria-modal="true" aria-label="Visualizar impressão">
      <div className="print-preview-toolbar">
        <strong>Visualizar impressão</strong>
        <span className="print-preview-info">
          {state.status === "rendering" &&
            (state.pagesSoFar > 0 ? `Paginando… (${state.pagesSoFar} página${state.pagesSoFar === 1 ? "" : "s"})` : "Paginando…")}
          {state.status === "ready" && `${state.pages} página${state.pages === 1 ? "" : "s"}`}
        </span>
        {state.status === "rendering" && <span className="print-preview-progress" aria-hidden="true" />}
        <div className="tb-spacer" />
        <button
          className="tb-btn"
          onClick={() => window.print()}
          disabled={state.status !== "ready"}
          title="Abre o diálogo de impressão; escolha 'Salvar como PDF' para exportar"
        >
          🖨 Imprimir / PDF
        </button>
        <button className="tb-btn" onClick={onClose} title="Fechar (Esc)">✕</button>
      </div>

      {state.status === "error" && (
        <div className="print-preview-error">
          <p>A paginação falhou; você ainda pode exportar no modo simples (sem cabeçalho/rodapé).</p>
          <button className="tb-btn" onClick={fallback}>Exportar no modo simples</button>
        </div>
      )}

      <div ref={pagesRef} className="print-preview-pages" />
    </div>,
    document.body
  );
}
