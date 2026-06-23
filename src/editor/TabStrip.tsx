import { Tab, tabTitle } from "../lib/tabs";

interface TabStripProps {
  tabs: Tab[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
}

export function TabStrip({ tabs, activeId, onSelect, onClose, onNew }: TabStripProps) {
  return (
    <div className="tab-strip">
      {tabs.map((t) => (
        <div
          key={t.id}
          className={"tab" + (t.id === activeId ? " is-active" : "")}
          onClick={() => onSelect(t.id)}
          onAuxClick={(e) => {
            if (e.button === 1) {
              e.preventDefault();
              onClose(t.id);
            }
          }}
          title={t.filePath ?? "sem título"}
        >
          <span className="tab-title">
            {t.dirty ? "● " : ""}
            {tabTitle(t)}
          </span>
          <button
            className="tab-close"
            onClick={(e) => {
              e.stopPropagation();
              onClose(t.id);
            }}
            title="Fechar aba"
          >
            ✕
          </button>
        </div>
      ))}
      <button className="tab-new" onClick={onNew} title="Nova aba (Ctrl+T)">
        +
      </button>
    </div>
  );
}
