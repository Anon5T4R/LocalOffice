import { useEffect, useRef, useState } from "react";
import { Recent } from "../lib/settings";

interface MenuBarProps {
  aiOpen: boolean;
  chaptersOpen: boolean;
  reviewOpen: boolean;
  recents: Recent[];
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onNew: () => void;
  onToggleAi: () => void;
  onToggleChapters: () => void;
  onToggleReview: () => void;
  onOpenRecent: (path: string) => void;
  onOpenSettings: () => void;
  onExportPdf: () => void;
  onVersionHistory: () => void;
}

function RecentsMenu({ recents, onPick }: { recents: Recent[]; onPick: (path: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="tb-dropdown" ref={ref}>
      <button type="button" className="tb-btn" onClick={() => setOpen((v) => !v)} disabled={recents.length === 0} title="Arquivos recentes">
        Recentes ▾
      </button>
      {open && (
        <div className="tb-menu">
          {recents.map((r) => (
            <button
              key={r.path}
              className="tb-menu-item"
              title={r.path}
              onClick={() => {
                setOpen(false);
                onPick(r.path);
              }}
            >
              {r.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function MenuBar({
  aiOpen,
  chaptersOpen,
  reviewOpen,
  recents,
  onOpen,
  onSave,
  onSaveAs,
  onNew,
  onToggleAi,
  onToggleChapters,
  onToggleReview,
  onOpenRecent,
  onOpenSettings,
  onExportPdf,
  onVersionHistory,
}: MenuBarProps) {
  return (
    <div className="menubar">
      <span className="brand">LocalOffice</span>
      <div className="tb-sep" />
      <div className="tb-group">
        <button className="tb-btn" onClick={onNew} title="Nova aba (Ctrl+T / Ctrl+N)">Novo</button>
        <button className="tb-btn" onClick={onOpen} title="Abrir (Ctrl+O)">Abrir</button>
        <RecentsMenu recents={recents} onPick={onOpenRecent} />
        <button className="tb-btn" onClick={onSave} title="Salvar (Ctrl+S)">Salvar</button>
        <button className="tb-btn" onClick={onSaveAs} title="Salvar como (Ctrl+Shift+S)">Salvar como…</button>
        <button className="tb-btn" onClick={onExportPdf} title="Exportar como PDF">PDF</button>
        <button className="tb-btn" onClick={onVersionHistory} title="Histórico de versões">⏱ Versões</button>
      </div>

      <div className="tb-spacer" />

      <button className={"tb-btn" + (chaptersOpen ? " is-active" : "")} onClick={onToggleChapters} title="Capítulos (outline)">☰ Capítulos</button>
      <button className={"tb-btn" + (reviewOpen ? " is-active" : "")} onClick={onToggleReview} title="Comentários e alterações controladas">✎ Revisão</button>
      <button className={"tb-btn" + (aiOpen ? " is-active" : "")} onClick={onToggleAi} title="Painel de IA local">✦ IA</button>
      <button className="tb-btn" onClick={onOpenSettings} title="Configurações">⚙</button>
    </div>
  );
}
