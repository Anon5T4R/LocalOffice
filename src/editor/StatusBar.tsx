import { useEffect, useState } from "react";
import { Editor, useEditorState } from "@tiptap/react";

// Approx. content height of one A4 page at our page width, in CSS px.
const A4_PAGE_PX = 980;

export function StatusBar({ editor }: { editor: Editor }) {
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

  useEffect(() => {
    const el = editor.view.dom as HTMLElement;
    const measure = () => setHeightPages(Math.max(1, Math.ceil(el.scrollHeight / A4_PAGE_PX)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [editor]);

  // Manual page breaks set a floor; height estimate handles overflow within a page.
  const pages = Math.max(heightPages, breaks + 1);

  return (
    <div className="status-bar">
      <span title="Estimativa baseada na altura do conteúdo (A4)">~{pages} página{pages > 1 ? "s" : ""}</span>
      <span>{words} palavra{words === 1 ? "" : "s"}</span>
    </div>
  );
}
