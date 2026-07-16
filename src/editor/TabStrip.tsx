import { Tab, tabTitle } from "../lib/tabs";
import { t as tr } from "../lib/i18n";

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
          title={t.filePath ?? tr("common.untitled")}
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
            title={tr("tab.close")}
          >
            ✕
          </button>
        </div>
      ))}
      <button className="tab-new" onClick={onNew} title={tr("tab.new")}>
        +
      </button>
    </div>
  );
}
