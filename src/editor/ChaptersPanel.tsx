import { useState } from "react";
import { Editor, useEditorState } from "@tiptap/react";
import type { Node as PMNode } from "@tiptap/pm/model";
import { revealPos } from "./reveal";
import { useEditorInstance } from "../state/EditorContext";
import { arrayOfObjectsEqual } from "../lib/equality";

interface Heading {
  level: number;
  text: string;
  pos: number;
}

/**
 * A "section" is a heading plus everything under it, ending at the next
 * heading of the same or higher level, the footnotes section, or the doc end.
 * Only top-level headings are considered (the schema keeps them there).
 */
function sectionRange(doc: PMNode, headingPos: number): { from: number; to: number } | null {
  const heading = doc.nodeAt(headingPos);
  if (!heading || heading.type.name !== "heading") return null;
  const level = heading.attrs.level as number;
  let to = doc.content.size;
  let found = false;
  doc.forEach((child, offset) => {
    if (found || offset <= headingPos) return;
    const endsSection =
      (child.type.name === "heading" && child.attrs.level <= level) ||
      child.type.name === "footnotes";
    if (endsSection) {
      to = offset;
      found = true;
    }
  });
  return { from: headingPos, to };
}

/** Last position in the body (before the footnotes section, if any). */
function endOfBody(doc: PMNode): number {
  let end = doc.content.size;
  doc.forEach((child, offset) => {
    if (child.type.name === "footnotes") end = Math.min(end, offset);
  });
  return end;
}

/**
 * Move the section starting at `srcPos` to just before the section starting at
 * `dstPos` (or to the end of the body when `dstPos` is null).
 */
function moveSection(editor: Editor, srcPos: number, dstPos: number | null): void {
  const { doc } = editor.state;
  const src = sectionRange(doc, srcPos);
  if (!src) return;
  const insertAt = dstPos == null ? endOfBody(doc) : dstPos;
  if (insertAt >= src.from && insertAt <= src.to) return; // dropped onto itself

  const slice = doc.slice(src.from, src.to);
  const tr = editor.state.tr.delete(src.from, src.to);
  tr.insert(tr.mapping.map(insertAt), slice.content);
  editor.view.dispatch(tr.scrollIntoView());
  editor.commands.focus();
}

export function ChaptersPanel({ onClose }: { onClose: () => void }) {
  const editor = useEditorInstance();
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | "end" | null>(null);

  const items = useEditorState({
    editor,
    selector: ({ editor }): Heading[] => {
      const out: Heading[] = [];
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === "footnotes") return false;
        if (node.type.name === "heading") {
          out.push({ level: node.attrs.level, text: node.textContent || "(sem título)", pos });
        }
        return true;
      });
      return out;
    },
    equalityFn: arrayOfObjectsEqual,
  });

  const go = (pos: number) => revealPos(editor, pos);

  const drop = (target: number | "end") => {
    if (dragIndex !== null) {
      moveSection(editor, items[dragIndex].pos, target === "end" ? null : items[target].pos);
    }
    setDragIndex(null);
    setOverIndex(null);
  };

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
          <button
            key={i}
            className={
              `chapter-item lvl-${h.level}` +
              (overIndex === i ? " drag-over" : "") +
              (dragIndex === i ? " dragging" : "")
            }
            onClick={() => go(h.pos)}
            title={`${h.text} — arraste para reordenar a seção`}
            draggable
            onDragStart={() => setDragIndex(i)}
            onDragEnd={() => { setDragIndex(null); setOverIndex(null); }}
            onDragOver={(e) => { e.preventDefault(); setOverIndex(i); }}
            onDrop={(e) => { e.preventDefault(); drop(i); }}
          >
            {h.text}
          </button>
        ))}
        {dragIndex !== null && (
          <div
            className={"chapter-drop-end" + (overIndex === "end" ? " drag-over" : "")}
            onDragOver={(e) => { e.preventDefault(); setOverIndex("end"); }}
            onDrop={(e) => { e.preventDefault(); drop("end"); }}
          >
            ⤓ mover para o fim
          </div>
        )}
      </div>
    </aside>
  );
}
