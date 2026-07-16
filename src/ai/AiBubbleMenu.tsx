import { useState } from "react";
import { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { LocalAi } from "./useLocalAi";
import { translateLangs, tones } from "./actions";
import { t } from "../lib/i18n";

interface Props {
  editor: Editor;
  ai: LocalAi;
  onOpenPanel: () => void;
}

/** Floating toolbar over a text selection: AI actions on that selection. */
export function AiBubbleMenu({ editor, ai, onOpenPanel }: Props) {
  const [sub, setSub] = useState<null | "translate" | "tone">(null);

  const run = (id: string, arg?: string) => {
    setSub(null);
    onOpenPanel();
    ai.runSelection(id, arg);
  };

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="ai-bubble"
      updateDelay={100}
      shouldShow={({ editor }) => {
        const { from, to, empty } = editor.state.selection;
        return !empty && editor.state.doc.textBetween(from, to).trim().length > 0;
      }}
      className="ai-bubble"
    >
      {!ai.ready ? (
        <span className="ai-bubble-hint">{t("aiBubble.startHint")}</span>
      ) : sub === "translate" ? (
        <>
          <button className="ai-bubble-btn" onClick={() => setSub(null)}>←</button>
          {translateLangs().map((l) => (
            <button key={l} className="ai-bubble-btn" onClick={() => run("translate", l)}>{l}</button>
          ))}
        </>
      ) : sub === "tone" ? (
        <>
          <button className="ai-bubble-btn" onClick={() => setSub(null)}>←</button>
          {tones().map((tone) => (
            <button key={tone} className="ai-bubble-btn" onClick={() => run("tone", tone)}>{tone}</button>
          ))}
        </>
      ) : (
        <>
          <button className="ai-bubble-btn" onClick={() => run("rewrite")}>{t("aiBubble.rewrite")}</button>
          <button className="ai-bubble-btn" onClick={() => run("review")}>{t("aiBubble.review")}</button>
          <button className="ai-bubble-btn" onClick={() => run("summarize")}>{t("aiBubble.summarize")}</button>
          <button className="ai-bubble-btn" onClick={() => setSub("translate")}>{t("aiBubble.translate")}</button>
          <button className="ai-bubble-btn" onClick={() => setSub("tone")}>{t("aiBubble.tone")}</button>
          <button className="ai-bubble-btn" onClick={() => run("bullets")}>{t("aiBubble.bullets")}</button>
          <button className="ai-bubble-btn" onClick={() => run("continue")}>{t("aiBubble.continue")}</button>
        </>
      )}
    </BubbleMenu>
  );
}
