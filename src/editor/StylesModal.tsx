import { useState } from "react";
import { Modal } from "../components/Modal";
import { useEditorInstance } from "../state/EditorContext";
import { useSettings } from "../state/SettingsContext";
import { effectiveLayout, patchDocLayout } from "./DocLayout";
import { STYLE_TARGETS, type BlockStyle, type DocStyles } from "../lib/docStyles";
import { ptToPx, pxToPt } from "../lib/fontUnits";
import { t, type MessageKey } from "../lib/i18n";

const FONTS = ["", "Sans-serif", "Serif", "Monospace", "Arial", "Times New Roman", "Courier New", "Georgia", "Verdana"];
// Built at render (not a module const) so the labels follow the UI language.
const alignOptions = (): { value: BlockStyle["align"] | ""; label: string }[] => [
  { value: "", label: t("styles.alignNone") },
  { value: "left", label: t("styles.alignLeft") },
  { value: "center", label: t("styles.alignCenter") },
  { value: "right", label: t("styles.alignRight") },
  { value: "justify", label: t("styles.alignJustify") },
];

const STYLE_TARGET_LABEL: Record<string, MessageKey> = {
  paragraph: "styles.target.paragraph",
  h1: "styles.target.h1",
  h2: "styles.target.h2",
  h3: "styles.target.h3",
  blockquote: "styles.target.blockquote",
  caption: "styles.target.caption",
  generated: "styles.target.generated",
};

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
        // O campo de tamanho fala pontos (a "fonte 12" da ABNT); o layout
        // guarda px como todo o resto do motor (lib/fontUnits.ts).
        (cur as Record<string, unknown>)[prop] = prop === "fontSizePx" ? ptToPx(n) : n;
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
    <Modal title={t("styles.title")} onClose={onClose} boxStyle={{ width: 680, maxWidth: "94vw" }}>
      <div className="modal-body">
        <p className="styles-hint">{t("styles.hint")}</p>
        <table className="styles-grid">
          <thead>
            <tr>
              <th>{t("styles.colStyle")}</th>
              <th>{t("styles.colFont")}</th>
              <th>{t("styles.colSize")}</th>
              <th>{t("styles.colLineHeight")}</th>
              <th>{t("styles.colAlign")}</th>
              <th>{t("styles.colBefore")}</th>
              <th title={t("styles.indentTitle")}>{t("styles.colIndent")}</th>
            </tr>
          </thead>
          <tbody>
            {STYLE_TARGETS.map(({ key }) => {
              const s = draft[key] ?? {};
              return (
                <tr key={key}>
                  <td>{t(STYLE_TARGET_LABEL[key])}</td>
                  <td>
                    <select value={s.fontFamily ?? ""} onChange={(e) => patch(key, "fontFamily", e.target.value)}>
                      {FONTS.map((f) => (
                        <option key={f} value={f}>{f || t("styles.fontDefault")}</option>
                      ))}
                    </select>
                  </td>
                  <td><input type="number" min={6} max={96} step={0.5} value={num(s.fontSizePx === undefined ? undefined : pxToPt(s.fontSizePx))} onChange={(e) => patch(key, "fontSizePx", e.target.value)} /></td>
                  <td><input type="number" step={0.05} min={0.8} max={4} value={num(s.lineHeight)} onChange={(e) => patch(key, "lineHeight", e.target.value)} /></td>
                  <td>
                    <select value={s.align ?? ""} onChange={(e) => patch(key, "align", e.target.value)}>
                      {alignOptions().map((a) => (
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
          <button className="tb-btn" onClick={() => setDraft({})} title={t("styles.clearAllTitle")}>
            {t("styles.clearAll")}
          </button>
          <span style={{ flex: 1 }} />
          <button className="tb-btn" onClick={onClose}>{t("common.cancel")}</button>
          <button className="tb-btn tb-primary" onClick={apply}>{t("common.apply")}</button>
        </div>
      </div>
    </Modal>
  );
}
