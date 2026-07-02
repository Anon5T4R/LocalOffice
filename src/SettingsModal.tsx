import { useSyncExternalStore } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { HeaderFooterSpec, Theme, clearRecents } from "./lib/settings";
import * as citationStore from "./lib/citationStore";
import { useSettings } from "./state/SettingsContext";

const CSL_STYLE_OPTIONS = [
  { id: "abnt", name: "ABNT (autor-data)" },
  { id: "apa", name: "APA 7ª ed." },
  { id: "chicago", name: "Chicago (autor-data)" },
  { id: "ieee", name: "IEEE (numérico)" },
  { id: "custom", name: "Arquivo .csl personalizado…" },
];

interface SettingsModalProps {
  onClose: () => void;
}

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

export function SettingsModal({ onClose }: SettingsModalProps) {
  const { settings, updateSettings: onChange } = useSettings();
  useSyncExternalStore(citationStore.subscribe, citationStore.getVersion);
  const bibError = citationStore.getError();
  const bibCount = citationStore.getItems().length;

  const browse = async (filters: { name: string; extensions: string[] }[], apply: (path: string) => void) => {
    try {
      const selected = await openDialog({ multiple: false, filters });
      if (selected && !Array.isArray(selected)) apply(selected);
    } catch (e) {
      window.alert(`Não foi possível abrir o seletor de arquivos:\n${e}`);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <strong>Configurações</strong>
          <button className="tb-btn" onClick={onClose} title="Fechar">✕</button>
        </div>

        <div className="modal-body">
          <label className="ai-field">
            <span>Tema</span>
            <select value={settings.theme} onChange={(e) => onChange({ theme: e.target.value as Theme })}>
              <option value="auto">Automático (segue o sistema)</option>
              <option value="light">Claro</option>
              <option value="dark">Escuro</option>
            </select>
          </label>

          <label className="ai-field">
            <span>Meta de palavras (0 = desligado)</span>
            <input
              type="number"
              min={0}
              value={settings.wordGoal || 0}
              onChange={(e) => onChange({ wordGoal: Math.max(0, Number(e.target.value) || 0) })}
            />
          </label>

          <label className="ai-field">
            <span>Seu nome (comentários e alterações)</span>
            <input
              value={settings.authorName || ""}
              placeholder="Autor"
              onChange={(e) => onChange({ authorName: e.target.value })}
            />
          </label>

          <label className="ai-field">
            <span>Corretor ortográfico</span>
            <select
              value={settings.spellcheck === false ? "off" : "on"}
              onChange={(e) => onChange({ spellcheck: e.target.value === "on" })}
            >
              <option value="on">Ativado (sublinha erros)</option>
              <option value="off">Desativado</option>
            </select>
          </label>

          <label className="ai-field">
            <span>Idioma do corretor</span>
            <select value={settings.docLang || "pt-BR"} onChange={(e) => onChange({ docLang: e.target.value })}>
              <option value="pt-BR">Português (Brasil)</option>
              <option value="pt-PT">Português (Portugal)</option>
              <option value="en-US">Inglês (EUA)</option>
              <option value="es-ES">Espanhol</option>
              <option value="fr-FR">Francês</option>
            </select>
          </label>

          <HeaderFooterRow
            label="Cabeçalho (impressão)"
            value={settings.pageHeader}
            onChange={(pageHeader) => onChange({ pageHeader })}
          />
          <HeaderFooterRow
            label="Rodapé (impressão)"
            value={settings.pageFooter}
            onChange={(pageFooter) => onChange({ pageFooter })}
          />
          <label className="ai-field hf-first-page">
            <span>
              <input
                type="checkbox"
                checked={settings.pageChromeOnFirst !== false}
                onChange={(e) => onChange({ pageChromeOnFirst: e.target.checked })}
              />{" "}
              Mostrar cabeçalho/rodapé na primeira página
            </span>
          </label>
          <p className="modal-note">
            Use os marcadores {"{page}"}, {"{pages}"}, {"{title}"} e {"{date}"} — ex.: "Página {"{page}"} de {"{pages}"}".
          </p>

          <div className="ai-field">
            <span>Bibliografia (.bib do Zotero ou CSL-JSON)</span>
            <div className="hf-row">
              <input
                value={settings.bibPath || ""}
                spellCheck={false}
                placeholder="ex.: C:\\Zotero\\biblioteca.bib"
                onChange={(e) => onChange({ bibPath: e.target.value })}
              />
              <button
                className="tb-btn"
                onClick={() =>
                  browse(
                    [{ name: "Bibliografia", extensions: ["bib", "json"] }],
                    (path) => onChange({ bibPath: path })
                  )
                }
              >
                Procurar…
              </button>
            </div>
            {settings.bibPath && bibError && <span className="bib-status bib-error">{bibError}</span>}
            {settings.bibPath && !bibError && bibCount > 0 && (
              <span className="bib-status">{bibCount} referência{bibCount === 1 ? "" : "s"} carregada{bibCount === 1 ? "" : "s"} — digite "[@" no texto para citar</span>
            )}
          </div>

          <label className="ai-field">
            <span>Estilo de citação</span>
            <select value={settings.cslStyle || "abnt"} onChange={(e) => onChange({ cslStyle: e.target.value })}>
              {CSL_STYLE_OPTIONS.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>

          {settings.cslStyle === "custom" && (
            <div className="ai-field">
              <span>Arquivo .csl</span>
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
                      [{ name: "Estilo CSL", extensions: ["csl"] }],
                      (path) => onChange({ customCslPath: path })
                    )
                  }
                >
                  Procurar…
                </button>
              </div>
            </div>
          )}

          <label className="ai-field">
            <span>Pasta de modelos GGUF</span>
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
              Limpar arquivos recentes
            </button>
          </div>

          <p className="modal-note">
            LocalOffice é 100% offline. A IA roda localmente (llama.cpp) e nenhum dado sai da sua máquina.
            Sincronize seus documentos colocando-os numa pasta do Syncthing/OneDrive — o app não precisa saber.
          </p>
        </div>
      </div>
    </div>
  );
}
