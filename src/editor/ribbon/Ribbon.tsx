import { useEffect, useState } from "react";
import type { Mark } from "@tiptap/pm/model";
import type { DocTemplate } from "../../lib/templates";
import { useEditorInstance } from "../../state/EditorContext";
import { HomeTab } from "./HomeTab";
import { InsertTab } from "./InsertTab";
import { LayoutTab } from "./LayoutTab";
import { t } from "../../lib/i18n";

interface RibbonProps {
  onInsertImage: () => void;
  onApplyTemplate: (tmpl: DocTemplate) => void;
}

/**
 * Toolbar with one component per tab. Only the active tab is mounted, so only
 * its (small) useEditorState selector subscribes to editor transactions.
 *
 * The format painter's state lives here (not in HomeTab) so it survives
 * switching to another ribbon tab after arming it — HomeTab unmounting would
 * otherwise silently disarm it.
 */
export function Ribbon({ onInsertImage, onApplyTemplate }: RibbonProps) {
  const [tab, setTab] = useState<"inicio" | "inserir" | "layout">("inicio");
  const editor = useEditorInstance();
  const [painterMarks, setPainterMarks] = useState<readonly Mark[] | null>(null);

  // After capturing marks, the next non-empty selection gets them.
  useEffect(() => {
    if (!painterMarks) return;
    const apply = () => {
      const sel = editor.state.selection;
      if (sel.empty) return;
      const chain = editor.chain().focus().unsetAllMarks();
      painterMarks.forEach((m) => chain.setMark(m.type.name, m.attrs));
      chain.run();
      setPainterMarks(null);
    };
    editor.on("selectionUpdate", apply);
    return () => { editor.off("selectionUpdate", apply); };
  }, [editor, painterMarks]);

  const copyFormat = () => {
    const sel = editor.state.selection;
    const marks = sel.empty ? sel.$from.marks() : sel.$from.marksAcross(sel.$to) ?? sel.$from.marks();
    setPainterMarks(marks);
  };

  return (
    <div className="ribbon">
      <div className="ribbon-tabs">
        <button className={"ribbon-tab" + (tab === "inicio" ? " is-active" : "")} onClick={() => setTab("inicio")}>
          {t("ribbon.home")}
        </button>
        <button className={"ribbon-tab" + (tab === "inserir" ? " is-active" : "")} onClick={() => setTab("inserir")}>
          {t("ribbon.insert")}
        </button>
        <button className={"ribbon-tab" + (tab === "layout" ? " is-active" : "")} onClick={() => setTab("layout")}>
          {t("ribbon.layout")}
        </button>
      </div>

      {tab === "inicio" && <HomeTab painterActive={!!painterMarks} onCopyFormat={copyFormat} />}
      {tab === "inserir" && <InsertTab onInsertImage={onInsertImage} />}
      {tab === "layout" && <LayoutTab onApplyTemplate={onApplyTemplate} />}
    </div>
  );
}
