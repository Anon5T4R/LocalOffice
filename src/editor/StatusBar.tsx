import { useEffect, useState } from "react";
import { Editor, useEditorState } from "@tiptap/react";
import { PageFormat } from "../lib/settings";

const PAGE_HEIGHT_PX: Record<string, number> = {
  classic: 980,
  a4: 1123,
  a5: 794,
  letter: 1056,
  a3: 1587,
};

export function StatusBar({ editor, pageFormat = "classic" }: { editor: Editor; pageFormat?: PageFormat }) {
  const { words, breaks } = useEditorState({
    editor,
    selector: ({ editor }) => {
      const text = editor.getText().trim();
      let breaks = 0;
      editor.state.doc.descendants((n) => {
        if (n.type.name === "pageBreak") breaks += 1;
      });
      return { words: text ? text.split(/\s+/).length : 0, breaks };
    },
  })!;

  const [heightPages, setHeightPages] = useState(1);
  const pagePx = PAGE_HEIGHT_PX[pageFormat] || 980;

  useEffect(() => {
    const el = editor.view.dom as HTMLElement;
    const measure = () => setHeightPages(Math.max(1, Math.ceil(el.scrollHeight / pagePx)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [editor, pagePx]);

  const pages = Math.max(heightPages, breaks + 1);

  return (
    <div className="status-bar">
      <span title="Estimativa baseada na altura do conteúdo">~{pages} página{pages > 1 ? "s" : ""}</span>
      <span>{words} palavra{words === 1 ? "" : "s"}</span>
    </div>
  );
}
