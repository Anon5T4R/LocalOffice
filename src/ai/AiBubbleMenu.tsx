import { useState } from "react";
import { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { LocalAi } from "./useLocalAi";
import { TRANSLATE_LANGS, TONES } from "./actions";

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
        <span className="ai-bubble-hint">Inicie a IA no painel ✦</span>
      ) : sub === "translate" ? (
        <>
          <button className="ai-bubble-btn" onClick={() => setSub(null)}>←</button>
          {TRANSLATE_LANGS.map((l) => (
            <button key={l} className="ai-bubble-btn" onClick={() => run("translate", l)}>{l}</button>
          ))}
        </>
      ) : sub === "tone" ? (
        <>
          <button className="ai-bubble-btn" onClick={() => setSub(null)}>←</button>
          {TONES.map((t) => (
            <button key={t} className="ai-bubble-btn" onClick={() => run("tone", t)}>{t}</button>
          ))}
        </>
      ) : (
        <>
          <button className="ai-bubble-btn" onClick={() => run("rewrite")}>Reescrever</button>
          <button className="ai-bubble-btn" onClick={() => run("review")}>Revisar</button>
          <button className="ai-bubble-btn" onClick={() => run("summarize")}>Resumir</button>
          <button className="ai-bubble-btn" onClick={() => setSub("translate")}>Traduzir ▾</button>
          <button className="ai-bubble-btn" onClick={() => setSub("tone")}>Tom ▾</button>
          <button className="ai-bubble-btn" onClick={() => run("bullets")}>Tópicos</button>
          <button className="ai-bubble-btn" onClick={() => run("continue")}>Continuar</button>
        </>
      )}
    </BubbleMenu>
  );
}
