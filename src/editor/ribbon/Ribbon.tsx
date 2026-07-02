import { useState } from "react";
import type { DocTemplate } from "../../lib/templates";
import { HomeTab } from "./HomeTab";
import { InsertTab } from "./InsertTab";
import { LayoutTab } from "./LayoutTab";

interface RibbonProps {
  onInsertImage: () => void;
  onApplyTemplate: (tmpl: DocTemplate) => void;
}

/**
 * Toolbar with one component per tab. Only the active tab is mounted, so only
 * its (small) useEditorState selector subscribes to editor transactions.
 */
export function Ribbon({ onInsertImage, onApplyTemplate }: RibbonProps) {
  const [tab, setTab] = useState<"inicio" | "inserir" | "layout">("inicio");

  return (
    <div className="ribbon">
      <div className="ribbon-tabs">
        <button className={"ribbon-tab" + (tab === "inicio" ? " is-active" : "")} onClick={() => setTab("inicio")}>
          Início
        </button>
        <button className={"ribbon-tab" + (tab === "inserir" ? " is-active" : "")} onClick={() => setTab("inserir")}>
          Inserir
        </button>
        <button className={"ribbon-tab" + (tab === "layout" ? " is-active" : "")} onClick={() => setTab("layout")}>
          Layout
        </button>
      </div>

      {tab === "inicio" && <HomeTab />}
      {tab === "inserir" && <InsertTab onInsertImage={onInsertImage} />}
      {tab === "layout" && <LayoutTab onApplyTemplate={onApplyTemplate} />}
    </div>
  );
}
