import { Editor, useEditorState } from "@tiptap/react";

interface Heading {
  level: number;
  text: string;
  pos: number;
}

export function ChaptersPanel({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const items = useEditorState({
    editor,
    selector: ({ editor }): Heading[] => {
      const out: Heading[] = [];
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === "heading") {
          out.push({ level: node.attrs.level, text: node.textContent || "(sem título)", pos });
        }
      });
      return out;
    },
    equalityFn: (a, b) => JSON.stringify(a) === JSON.stringify(b),
  })!;

  const go = (pos: number) => editor.chain().focus().setTextSelection(pos + 1).scrollIntoView().run();

  return (
    <aside className="chapters-panel">
      <div className="panel-header">
        <strong>Capítulos</strong>
        <span className="ai-spacer" />
        <button className="tb-btn" onClick={onClose} title="Fechar painel">✕</button>
      </div>
      <div className="chapters-list">
        {items.length === 0 && <div className="ai-empty">Sem títulos ainda.<br />Use H1–H3 para criar capítulos.</div>}
        {items.map((h, i) => (
          <button key={i} className={`chapter-item lvl-${h.level}`} onClick={() => go(h.pos)} title={h.text}>
            {h.text}
          </button>
        ))}
      </div>
    </aside>
  );
}
