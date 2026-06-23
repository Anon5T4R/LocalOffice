import { Settings, Theme, clearRecents } from "./lib/settings";

interface SettingsModalProps {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onClose: () => void;
}

export function SettingsModal({ settings, onChange, onClose }: SettingsModalProps) {
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
