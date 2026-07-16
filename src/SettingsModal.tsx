import { useSyncExternalStore } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { Theme, clearRecents } from "./lib/settings";
import * as citationStore from "./lib/citationStore";
import { useSettings } from "./state/SettingsContext";
import { Modal } from "./components/Modal";
import { LocalePicker } from "./components/LocalePicker";
import { t } from "./lib/i18n";

// Nomes de estilo (ABNT/APA/Chicago/IEEE) e styleId são de norma/domínio — NÃO
// traduzidos. Só o rótulo da opção "custom" é de UI.
const CSL_STYLE_OPTIONS = [
  { id: "abnt", name: "ABNT (autor-data)" },
  { id: "apa", name: "APA 7ª ed." },
  { id: "chicago", name: "Chicago (autor-data)" },
  { id: "ieee", name: "IEEE (numérico)" },
];

interface SettingsModalProps {
  onClose: () => void;
  /** Opens the document's header/footer dialog (editor/HeaderFooterModal.tsx). */
  onOpenHeaderFooter: () => void;
}

export function SettingsModal({ onClose, onOpenHeaderFooter }: SettingsModalProps) {
  const { settings, updateSettings: onChange } = useSettings();
  useSyncExternalStore(citationStore.subscribe, citationStore.getVersion);
  const bibError = citationStore.getError();
  const bibCount = citationStore.getItems().length;

  const browse = async (filters: { name: string; extensions: string[] }[], apply: (path: string) => void) => {
    try {
      const selected = await openDialog({ multiple: false, filters });
      if (selected && !Array.isArray(selected)) apply(selected);
    } catch (e) {
      window.alert(t("settings.filePickerError", { e: String(e) }));
    }
  };

  return (
    <Modal title={t("settings.title")} onClose={onClose}>
      <div className="modal-body">
          <label className="ai-field">
            <span>{t("settings.uiLanguage")}</span>
            <LocalePicker />
          </label>

          <label className="ai-field">
            <span>{t("settings.theme")}</span>
            <select value={settings.theme} onChange={(e) => onChange({ theme: e.target.value as Theme })}>
              <option value="auto">{t("settings.themeAuto")}</option>
              <option value="light">{t("settings.themeLight")}</option>
              <option value="dark">{t("settings.themeDark")}</option>
            </select>
          </label>

          <label className="ai-field">
            <span>{t("settings.wordGoal")}</span>
            <input
              type="number"
              min={0}
              value={settings.wordGoal || 0}
              onChange={(e) => onChange({ wordGoal: Math.max(0, Number(e.target.value) || 0) })}
            />
          </label>

          <label className="ai-field">
            <span>{t("settings.authorName")}</span>
            <input
              value={settings.authorName || ""}
              placeholder={t("settings.authorPlaceholder")}
              onChange={(e) => onChange({ authorName: e.target.value })}
            />
          </label>

          <label className="ai-field">
            <span>{t("settings.spellcheck")}</span>
            <select
              value={settings.spellcheck === false ? "off" : "on"}
              onChange={(e) => onChange({ spellcheck: e.target.value === "on" })}
            >
              <option value="on">{t("settings.spellcheckOn")}</option>
              <option value="off">{t("settings.spellcheckOff")}</option>
            </select>
          </label>

          <label className="ai-field">
            <span>{t("settings.spellLang")}</span>
            <select value={settings.docLang || "pt-BR"} onChange={(e) => onChange({ docLang: e.target.value })}>
              <option value="pt-BR">{t("settings.spellPtBR")}</option>
              <option value="pt-PT">{t("settings.spellPtPT")}</option>
              <option value="en-US">{t("settings.spellEnUS")}</option>
              <option value="es-ES">{t("settings.spellEs")}</option>
              <option value="fr-FR">{t("settings.spellFr")}</option>
            </select>
          </label>

          <div className="ai-field">
            <span>{t("settings.headerFooter")}</span>
            <button
              className="tb-btn"
              onClick={() => {
                onClose();
                onOpenHeaderFooter();
              }}
              title={t("settings.headerFooterBtnTitle")}
            >
              {t("settings.headerFooterBtn")}
            </button>
          </div>

          <div className="ai-field">
            <span>{t("settings.bib")}</span>
            <div className="hf-row">
              <input
                value={settings.bibPath || ""}
                spellCheck={false}
                placeholder={t("settings.bibPlaceholder")}
                onChange={(e) => onChange({ bibPath: e.target.value })}
              />
              <button
                className="tb-btn"
                onClick={() =>
                  browse(
                    [{ name: t("settings.filterBib"), extensions: ["bib", "json"] }],
                    (path) => onChange({ bibPath: path })
                  )
                }
              >
                {t("settings.browse")}
              </button>
            </div>
            {settings.bibPath && bibError && <span className="bib-status bib-error">{bibError}</span>}
            {settings.bibPath && !bibError && bibCount > 0 && (
              <span className="bib-status">
                {t(bibCount === 1 ? "settings.bibLoadedOne" : "settings.bibLoadedMany", { n: bibCount })}
              </span>
            )}
          </div>

          <label className="ai-field">
            <span>{t("settings.cslStyle")}</span>
            <select value={settings.cslStyle || "abnt"} onChange={(e) => onChange({ cslStyle: e.target.value })}>
              {CSL_STYLE_OPTIONS.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
              <option value="custom">{t("settings.cslCustom")}</option>
            </select>
          </label>

          {settings.cslStyle === "custom" && (
            <div className="ai-field">
              <span>{t("settings.cslFile")}</span>
              <div className="hf-row">
                <input
                  value={settings.customCslPath || ""}
                  spellCheck={false}
                  onChange={(e) => onChange({ customCslPath: e.target.value })}
                />
                <button
                  className="tb-btn"
                  onClick={() =>
                    browse(
                      [{ name: t("settings.filterCsl"), extensions: ["csl"] }],
                      (path) => onChange({ customCslPath: path })
                    )
                  }
                >
                  {t("settings.browse")}
                </button>
              </div>
            </div>
          )}

          <label className="ai-field">
            <span>{t("settings.modelsDir")}</span>
            <input
              value={settings.modelsDir}
              spellCheck={false}
              onChange={(e) => onChange({ modelsDir: e.target.value })}
            />
          </label>

          <div className="modal-row">
            <button
              className="tb-btn"
              onClick={() => {
                clearRecents();
                onClose();
              }}
            >
              {t("settings.clearRecents")}
            </button>
          </div>

          <p className="modal-note">{t("settings.note")}</p>
        </div>
    </Modal>
  );
}
