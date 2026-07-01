import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Tab } from "./lib/tabs";

interface VersionData {
  id: string;
  name: string;
  ts: number;
  has_content: boolean;
}

interface VersionHistoryProps {
  tab: Tab;
  onClose: () => void;
  onSaveVersion: (name: string) => Promise<void>;
  onRestoreVersion: (versionId: string) => Promise<void>;
}

export function VersionHistory({ tab, onClose, onSaveVersion, onRestoreVersion }: VersionHistoryProps) {
  const [versions, setVersions] = useState<VersionData[]>([]);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!tab.filePath) return;
    try {
      const list = await invoke<VersionData[]>("list_versions", { docPath: tab.filePath });
      setVersions(list);
    } catch {
      setVersions([]);
    }
  }, [tab.filePath]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = useCallback(async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      await onSaveVersion(newName.trim());
      setNewName("");
      await load();
    } finally {
      setSaving(false);
    }
  }, [newName, onSaveVersion, load]);

  const handleRestore = useCallback(
    async (id: string) => {
      await onRestoreVersion(id);
      onClose();
    },
    [onRestoreVersion, onClose]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (!tab.filePath) return;
      if (!window.confirm("Excluir esta versão permanentemente?")) return;
      try {
        await invoke("delete_version", { docPath: tab.filePath, versionId: id });
        await load();
      } catch (e) {
        window.alert(`Erro ao excluir: ${e}`);
      }
    },
    [tab.filePath, load]
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxHeight: "80vh", display: "flex", flexDirection: "column" }}>
        <div className="modal-header">
          <strong>Histórico de versões</strong>
          <button className="tb-btn" onClick={onClose} title="Fechar">✕</button>
        </div>

        <div className="modal-body" style={{ flex: 1, overflow: "auto", gap: "10px" }}>
          {!tab.filePath && (
            <p className="modal-note">Salve o documento para poder criar versões.</p>
          )}

          {tab.filePath && (
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                className="tb-btn tb-select"
                style={{ flex: 1, minWidth: 0, height: 30, padding: "0 8px" }}
                placeholder="Nome da versão..."
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
              />
              <button className="tb-btn" onClick={handleSave} disabled={!newName.trim() || saving} title="Salvar versão atual">
                {saving ? "…" : "Salvar"}
              </button>
            </div>
          )}

          {versions.length === 0 && tab.filePath && (
            <p className="modal-note">Nenhuma versão salva ainda.</p>
          )}

          {versions.map((v) => (
            <div
              key={v.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 10px",
                border: "1px solid var(--border)",
                borderRadius: 8,
                background: "var(--bg)",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{v.name}</div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>
                  {new Date(v.ts * 1000).toLocaleString("pt-BR")}
                </div>
              </div>
              <button
                className="tb-btn"
                onClick={() => handleRestore(v.id)}
                title="Restaurar esta versão"
                style={{ fontSize: 12 }}
              >
                Restaurar
              </button>
              <button
                className="tb-btn"
                onClick={() => handleDelete(v.id)}
                title="Excluir versão"
                style={{ fontSize: 12, color: "#ef4444" }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
