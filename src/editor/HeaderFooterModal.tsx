import { useState } from "react";
import { Modal } from "../components/Modal";
import { useEditorInstance } from "../state/EditorContext";
import { useSettings } from "../state/SettingsContext";
import { effectiveLayout, patchDocLayout } from "./DocLayout";
import type { HeaderFooterSpec } from "../lib/settings";
import { t } from "../lib/i18n";

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
        {slot("left", t("hf.left"))}
        {slot("center", t("hf.center"))}
        {slot("right", t("hf.right"))}
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
    <Modal title={t("hf.title")} onClose={onClose} boxStyle={{ width: 560, maxWidth: "94vw" }}>
      <div className="modal-body">
        <p className="styles-hint">{t("hf.hint")}</p>
        <HeaderFooterRow
          label={t("hf.header")}
          value={draft.pageHeader}
          onChange={(pageHeader) => setDraft((d) => ({ ...d, pageHeader }))}
        />
        <HeaderFooterRow
          label={t("hf.footer")}
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
            {t("hf.showFirst")}
          </span>
        </label>
        <div className="ai-field">
          <span>{t("hf.advanced")}</span>
          <div className="hf-row">
            <span className="modal-note" style={{ margin: 0 }}>{t("hf.fromPhysical")}</span>
            <input
              type="number"
              min={1}
              style={{ width: 64 }}
              placeholder={t("hf.autoPlaceholder")}
              value={draft.pageChromeFrom ?? ""}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                setDraft((d) => ({ ...d, pageChromeFrom: Number.isNaN(v) ? null : Math.max(1, v) }));
              }}
            />
            <span className="modal-note" style={{ margin: 0 }}>{t("hf.numberedAs")}</span>
            <input
              type="number"
              min={0}
              style={{ width: 64 }}
              placeholder={t("hf.samePlaceholder")}
              value={draft.pageNumberStart ?? ""}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                setDraft((d) => ({ ...d, pageNumberStart: Number.isNaN(v) ? null : v }));
              }}
            />
          </div>
        </div>
        <p className="modal-note">{t("hf.tokens")}</p>
        <div className="styles-actions">
          <span style={{ flex: 1 }} />
          <button className="tb-btn" onClick={onClose}>{t("common.cancel")}</button>
          <button className="tb-btn tb-primary" onClick={apply}>{t("common.apply")}</button>
        </div>
      </div>
    </Modal>
  );
}
