import { useEffect, useRef, useState } from "react";
import { useEditorState } from "@tiptap/react";
import { searchKey } from "./SearchExtension";
import { useEditorInstance } from "../../state/EditorContext";
import { t } from "../../lib/i18n";

export function SearchBar({ onClose }: { onClose: () => void }) {
  const editor = useEditorInstance();
  const [term, setTerm] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const { total, current } = useEditorState({
    editor,
    selector: ({ editor }) => {
      const s = searchKey.getState(editor.state);
      return { total: s?.results.length ?? 0, current: s?.current ?? 0 };
    },
  });

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const update = (v: string) => {
    setTerm(v);
    editor.commands.setSearchTerm(v);
  };

  const close = () => {
    editor.commands.clearSearch();
    onClose();
  };

  return (
    <div className="search-bar">
      <input
        ref={inputRef}
        value={term}
        onChange={(e) => update(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (e.shiftKey) editor.commands.findPrev();
            else editor.commands.findNext();
          } else if (e.key === "Escape") {
            e.preventDefault();
            close();
          }
        }}
        placeholder={t("search.placeholder")}
      />
      <span className="search-count">{total ? `${current + 1}/${total}` : "0/0"}</span>
      <button className="tb-btn" onClick={() => editor.commands.findPrev()} disabled={!total} title={t("search.prev")}>↑</button>
      <button className="tb-btn" onClick={() => editor.commands.findNext()} disabled={!total} title={t("search.next")}>↓</button>
      <button className="tb-btn" onClick={close} title={t("search.close")}>✕</button>
    </div>
  );
}
