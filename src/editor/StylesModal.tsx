import { useState } from "react";
import { Modal } from "../components/Modal";
import { useEditorInstance } from "../state/EditorContext";
import { useSettings } from "../state/SettingsContext";
import { effectiveLayout, patchDocLayout } from "./DocLayout";
import { STYLE_TARGETS, type BlockStyle, type DocStyles } from "../lib/docStyles";

const FONTS = ["", "Sans-serif", "Serif", "Monospace", "Arial", "Times New Roman", "Courier New", "Georgia", "Verdana"];
const ALIGNS: { value: BlockStyle["align"] | ""; label: string }[] = [
  { value: "", label: "—" },
  { value: "left", label: "Esquerda" },
  { value: "center", label: "Centro" },
  { value: "right", label: "Direita" },
  { value: "justify", label: "Justificado" },
];

/**
 * Named-styles editor: one definition per block type, applied to every block
 * of that type, traveling with the document (they live in the layout attr).
 * Local draft state; "Aplicar" commits everything as ONE layout transaction,
 * so a whole styling session undoes with a single Ctrl+Z.
 */
export function StylesModal({ onClose }: { onClose: () => void }) {
  const editor = useEditorInstance();
  const { settings } = useSettings();
  const [draft, setDraft] = useState<DocStyles>(
    () => (effectiveLayout(editor.state.doc, settings).styles ?? {}) as DocStyles
  );

  const patch = (key: keyof DocStyles, prop: keyof BlockStyle, value: string) => {
    setDraft((d) => {
      const cur: BlockStyle = { ...(d[key] ?? {}) };
      if (value === "") {
        delete cur[prop];
      } else if (prop === "fontFamily" || prop === "align") {
        (cur as Record<string, unknown>)[prop] = value;
      } else {
        const n = Number(value.replace(",", "."));
        if (Number.isNaN(n)) return d;
        (cur as Record<string, unknown>)[prop] = n;
      }
      const next = { ...d };
      if (Object.keys(cur).length === 0) delete next[key];
      else next[key] = cur;
      return next;
    });
  };

  const apply = () => {
    patchDocLayout(editor, settings, { styles: Object.keys(draft).length ? draft : null });
    onClose();
  };

  const num = (v: number | undefined) => (v === undefined ? "" : String(v));

  return (
    <Modal title="Estilos do documento" onClose={onClose} boxStyle={{ width: 680, maxWidth: "94vw" }}>
      <div className="modal-body">
        <p className="styles-hint">
          Cada estilo vale para todos os blocos do tipo, viaja com o documento e vale igual no PDF.
          Campo vazio = padrão do app.
        </p>
        <table className="styles-grid">
          <thead>
            <tr>
              <th>Estilo</th>
              <th>Fonte</th>
              <th>Tam. (px)</th>
              <th>Entrelinha</th>
              <th>Alinh.</th>
              <th>Antes (em)</th>
              <th title="Recuo da primeira linha, em cm">Recuo (cm)</th>
            </tr>
          </thead>
          <tbody>
            {STYLE_TARGETS.map(({ key, label }) => {
              const s = draft[key] ?? {};
              return (
                <tr key={key}>
                  <td>{label}</td>
                  <td>
                    <select value={s.fontFamily ?? ""} onChange={(e) => patch(key, "fontFamily", e.target.value)}>
                      {FONTS.map((f) => (
                        <option key={f} value={f}>{f || "(padrão)"}</option>
                      ))}
                    </select>
                  </td>
                  <td><input type="number" min={6} max={96} value={num(s.fontSizePx)} onChange={(e) => patch(key, "fontSizePx", e.target.value)} /></td>
                  <td><input type="number" step={0.05} min={0.8} max={4} value={num(s.lineHeight)} onChange={(e) => patch(key, "lineHeight", e.target.value)} /></td>
                  <td>
                    <select value={s.align ?? ""} onChange={(e) => patch(key, "align", e.target.value)}>
                      {ALIGNS.map((a) => (
                        <option key={a.label} value={a.value ?? ""}>{a.label}</option>
                      ))}
                    </select>
                  </td>
                  <td><input type="number" step={0.25} min={0} max={6} value={num(s.spacingBeforeEm)} onChange={(e) => patch(key, "spacingBeforeEm", e.target.value)} /></td>
                  <td>
                    {key === "paragraph" ? (
                      <input type="number" step={0.25} min={0} max={6} value={num(s.firstLineIndentCm)} onChange={(e) => patch(key, "firstLineIndentCm", e.target.value)} />
                    ) : (
                      <span className="styles-na">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="styles-actions">
          <button className="tb-btn" onClick={() => setDraft({})} title="Voltar tudo ao padrão do app">
            Limpar tudo
          </button>
          <span style={{ flex: 1 }} />
          <button className="tb-btn" onClick={onClose}>Cancelar</button>
          <button className="tb-btn tb-primary" onClick={apply}>Aplicar</button>
        </div>
      </div>
    </Modal>
  );
}
