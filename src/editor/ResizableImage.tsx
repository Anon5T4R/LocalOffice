import { useRef, useState } from "react";
import Image from "@tiptap/extension-image";
import { NodeViewProps, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";

type Align = "left" | "center" | "right" | null;

/** Inline styles for each alignment (survive .html files and print export). */
const ALIGN_STYLE: Record<Exclude<Align, null>, string> = {
  left: "float: left; margin: 4px 16px 8px 0",
  right: "float: right; margin: 4px 0 8px 16px",
  center: "display: block; margin: 8px auto",
};

/**
 * The stock Image node plus width (drag the corner handle), alignment
 * (left float / centered / right float) and alt-text editing.
 */
function ImageView({ node, updateAttributes, selected }: NodeViewProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  // Width is kept locally while dragging and committed once on release, so a
  // resize is a single undo step instead of hundreds of transactions.
  const [dragWidth, setDragWidth] = useState<number | null>(null);

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const img = imgRef.current;
    if (!img) return;
    const startX = e.clientX;
    const startW = img.offsetWidth;
    let width = startW;
    const onMove = (ev: PointerEvent) => {
      width = Math.max(40, Math.round(startW + (ev.clientX - startX)));
      setDragWidth(width);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setDragWidth(null);
      updateAttributes({ width: String(width) });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const editAlt = () => {
    const alt = window.prompt("Texto alternativo (acessibilidade):", node.attrs.alt || "");
    if (alt !== null) updateAttributes({ alt });
  };

  const setAlign = (align: Align) =>
    updateAttributes({ align: node.attrs.align === align ? null : align });

  const width = dragWidth ?? (node.attrs.width ? Number(node.attrs.width) : null);

  return (
    <NodeViewWrapper
      className={"image-block" + (node.attrs.align ? ` align-${node.attrs.align}` : "")}
      data-drag-handle
    >
      <img
        ref={imgRef}
        src={node.attrs.src}
        alt={node.attrs.alt || ""}
        title={node.attrs.title || undefined}
        style={width ? { width: `${width}px` } : undefined}
        draggable={false}
      />
      {selected && (
        <>
          <div className="image-toolbar" contentEditable={false}>
            <button onClick={() => setAlign("left")} className={node.attrs.align === "left" ? "is-active" : ""} title="Flutuar à esquerda (texto contorna)">⬅</button>
            <button onClick={() => setAlign("center")} className={node.attrs.align === "center" ? "is-active" : ""} title="Centralizar">⬌</button>
            <button onClick={() => setAlign("right")} className={node.attrs.align === "right" ? "is-active" : ""} title="Flutuar à direita (texto contorna)">➡</button>
            <button onClick={editAlt} title="Texto alternativo">alt</button>
            {node.attrs.width && (
              <button onClick={() => updateAttributes({ width: null })} title="Tamanho original">↺</button>
            )}
          </div>
          <span className="image-resize-handle" contentEditable={false} onPointerDown={startResize} />
        </>
      )}
    </NodeViewWrapper>
  );
}

export const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (el) =>
          el.getAttribute("width") || parseInt(el.style.width || "") || null,
        renderHTML: (attrs) => (attrs.width ? { width: attrs.width } : {}),
      },
      align: {
        default: null,
        parseHTML: (el) => (el.getAttribute("data-align") as Align) || null,
        renderHTML: (attrs) => {
          const align = attrs.align as Align;
          if (!align) return {};
          return { "data-align": align, style: ALIGN_STYLE[align] };
        },
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageView);
  },
});
