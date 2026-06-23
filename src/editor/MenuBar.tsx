import { useEffect, useRef, useState } from "react";
import { Recent } from "../lib/settings";

interface MenuBarProps {
  fileName: string;
  dirty: boolean;
  aiOpen: boolean;
  recents: Recent[];
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onNew: () => void;
  onToggleAi: () => void;
  onOpenRecent: (path: string) => void;
  onOpenSettings: () => void;
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
  fileName,
  dirty,
  aiOpen,
  recents,
  onOpen,
  onSave,
  onSaveAs,
  onNew,
  onToggleAi,
  onOpenRecent,
  onOpenSettings,
}: MenuBarProps) {
  return (
    <div className="menubar">
      <span className="brand">LocalOffice</span>
      <div className="tb-sep" />
      <div className="tb-group">
        <button className="tb-btn" onClick={onNew} title="Novo (Ctrl+N)">Novo</button>
        <button className="tb-btn" onClick={onOpen} title="Abrir (Ctrl+O)">Abrir</button>
        <RecentsMenu recents={recents} onPick={onOpenRecent} />
        <button className="tb-btn" onClick={onSave} title="Salvar (Ctrl+S)">Salvar</button>
        <button className="tb-btn" onClick={onSaveAs} title="Salvar como (Ctrl+Shift+S)">Salvar como…</button>
      </div>

      <div className="tb-spacer" />

      <div className="tb-filename" title={fileName}>
        {dirty ? "● " : ""}
        {fileName}
      </div>
      <div className="tb-sep" />
      <button className={"tb-btn" + (aiOpen ? " is-active" : "")} onClick={onToggleAi} title="Painel de IA local">✦ IA</button>
      <button className="tb-btn" onClick={onOpenSettings} title="Configurações">⚙</button>
    </div>
  );
}
