import { useState } from "react";
import { Modal } from "../components/Modal";
import { useEditorInstance } from "../state/EditorContext";
import { useSettings } from "../state/SettingsContext";
import { effectiveLayout, patchDocLayout } from "./DocLayout";
import type { HeaderFooterSpec } from "../lib/settings";

/** Three aligned inputs (left/center/right) for one line of page chrome. */
function HeaderFooterRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: HeaderFooterSpec;
  onChange: (next: HeaderFooterSpec) => void;
}) {
  const slot = (key: keyof HeaderFooterSpec, placeholder: string) => (
    <input
      value={value[key]}
      spellCheck={false}
      placeholder={placeholder}
      onChange={(e) => onChange({ ...value, [key]: e.target.value })}
    />
  );
  return (
    <div className="ai-field">
      <span>{label}</span>
      <div className="hf-row">
        {slot("left", "esquerda")}
        {slot("center", "centro")}
        {slot("right", "direita")}
      </div>
    </div>
  );
}

/**
 * Header/footer dialog for the ACTIVE DOCUMENT (they live in the doc's layout
 * attr and travel with the file — see editor/DocLayout.ts). Reachable from
 * Inserir, Layout, ⚙ and by double-clicking a page margin in paginated mode.
 * Local draft; "Aplicar" commits everything as ONE layout transaction, so the
 * whole session undoes with a single Ctrl+Z (same pattern as StylesModal).
 */
export function HeaderFooterModal({ onClose }: { onClose: () => void }) {
  const editor = useEditorInstance();
  const { settings } = useSettings();
  const [draft, setDraft] = useState(() => {
    const l = effectiveLayout(editor.state.doc, settings);
    return {
      pageHeader: l.pageHeader,
      pageFooter: l.pageFooter,
      pageChromeOnFirst: l.pageChromeOnFirst,
      pageChromeFrom: l.pageChromeFrom ?? null,
      pageNumberStart: l.pageNumberStart ?? null,
    };
  });

  const apply = () => {
    patchDocLayout(editor, settings, draft);
    onClose();
  };

  return (
    <Modal title="Cabeçalho e rodapé" onClose={onClose} boxStyle={{ width: 560, maxWidth: "94vw" }}>
      <div className="modal-body">
        <p className="styles-hint">
          Valem para este documento (viajam com o arquivo) e aparecem nas páginas do editor,
          na impressão e no PDF.
        </p>
        <HeaderFooterRow
          label="Cabeçalho"
          value={draft.pageHeader}
          onChange={(pageHeader) => setDraft((d) => ({ ...d, pageHeader }))}
        />
        <HeaderFooterRow
          label="Rodapé"
          value={draft.pageFooter}
          onChange={(pageFooter) => setDraft((d) => ({ ...d, pageFooter }))}
        />
        <label className="ai-field hf-first-page">
          <span>
            <input
              type="checkbox"
              checked={draft.pageChromeOnFirst}
              disabled={draft.pageChromeFrom != null}
              onChange={(e) => setDraft((d) => ({ ...d, pageChromeOnFirst: e.target.checked }))}
            />{" "}
            Mostrar cabeçalho/rodapé na primeira página
          </span>
        </label>
        <div className="ai-field">
          <span>Numeração avançada (ABNT: número só na parte textual)</span>
          <div className="hf-row">
            <span className="modal-note" style={{ margin: 0 }}>Mostrar a partir da página física</span>
            <input
              type="number"
              min={1}
              style={{ width: 64 }}
              placeholder="auto"
              value={draft.pageChromeFrom ?? ""}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                setDraft((d) => ({ ...d, pageChromeFrom: Number.isNaN(v) ? null : Math.max(1, v) }));
              }}
            />
            <span className="modal-note" style={{ margin: 0 }}>numerada como</span>
            <input
              type="number"
              min={0}
              style={{ width: 64 }}
              placeholder="igual"
              value={draft.pageNumberStart ?? ""}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                setDraft((d) => ({ ...d, pageNumberStart: Number.isNaN(v) ? null : v }));
              }}
            />
          </div>
        </div>
        <p className="modal-note">
          Use os marcadores {"{page}"}, {"{pages}"}, {"{title}"} e {"{date}"} — ex.: "Página {"{page}"} de {"{pages}"}".
        </p>
        <div className="styles-actions">
          <span style={{ flex: 1 }} />
          <button className="tb-btn" onClick={onClose}>Cancelar</button>
          <button className="tb-btn tb-primary" onClick={apply}>Aplicar</button>
        </div>
      </div>
    </Modal>
  );
}
