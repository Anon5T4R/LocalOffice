import { Editor } from "@tiptap/core";

/**
 * Move the caret to the node at `pos` and scroll it to the centre of the
 * window — used by the outline navigators (table of contents, chapters panel).
 *
 * We deliberately scroll the heading's DOM element with the native
 * `scrollIntoView` rather than ProseMirror's, because in paginated mode the
 * edit surface is a fixed-height viewport (`.page-clip`) nested inside the
 * outer scroller, and that viewport can be taller than the window. ProseMirror
 * only scrolls the *inner* viewport enough to expose the caret, which can leave
 * the target below the fold; the native call walks every scroll container
 * (viewport and outer scroller alike) so the heading actually lands on screen.
 * In classic mode there is a single scroller and it behaves the same way.
 */
export function revealPos(editor: Editor, pos: number): void {
  editor.chain().focus().setTextSelection(pos + 1).run();

  const node = editor.view.nodeDOM(pos);
  const el = node instanceof HTMLElement ? node : (node?.parentElement ?? null);
  if (el) {
    requestAnimationFrame(() => el.scrollIntoView({ block: "center", behavior: "smooth" }));
  }
}
