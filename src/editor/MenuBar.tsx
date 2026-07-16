import { useEffect, useRef, useState } from "react";
import { Recent } from "../lib/settings";
import { useSettings } from "../state/SettingsContext";
import { t } from "../lib/i18n";

interface MenuBarProps {
  aiOpen: boolean;
  chaptersOpen: boolean;
  reviewOpen: boolean;
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
      <button type="button" className="tb-btn" onClick={() => setOpen((v) => !v)} disabled={recents.length === 0} title={t("menubar.recentsTitle")}>
        {t("menubar.recents")}
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
  const { recents } = useSettings();
  return (
    <div className="menubar">
      <span className="brand">LocalOffice</span>
      <div className="tb-sep" />
      <div className="tb-group">
        <button className="tb-btn" onClick={onNew} title={t("menubar.newTitle")}>{t("menubar.new")}</button>
        <button className="tb-btn" onClick={onOpen} title={t("menubar.openTitle")}>{t("menubar.open")}</button>
        <RecentsMenu recents={recents} onPick={onOpenRecent} />
        <button className="tb-btn" onClick={onSave} title={t("menubar.saveTitle")}>{t("menubar.save")}</button>
        <button className="tb-btn" onClick={onSaveAs} title={t("menubar.saveAsTitle")}>{t("menubar.saveAs")}</button>
        <button className="tb-btn" onClick={onExportPdf} title={t("menubar.pdfTitle")}>{t("menubar.pdf")}</button>
        <button className="tb-btn" onClick={onVersionHistory} title={t("menubar.versionsTitle")}>{t("menubar.versions")}</button>
      </div>

      <div className="tb-spacer" />

      <button className={"tb-btn" + (chaptersOpen ? " is-active" : "")} onClick={onToggleChapters} title={t("menubar.chaptersTitle")}>{t("menubar.chapters")}</button>
      <button className={"tb-btn" + (reviewOpen ? " is-active" : "")} onClick={onToggleReview} title={t("menubar.reviewTitle")}>{t("menubar.review")}</button>
      <button className={"tb-btn" + (aiOpen ? " is-active" : "")} onClick={onToggleAi} title={t("menubar.aiTitle")}>{t("menubar.ai")}</button>
      <button className="tb-btn" onClick={onOpenSettings} title={t("menubar.settingsTitle")}>⚙</button>
    </div>
  );
}
