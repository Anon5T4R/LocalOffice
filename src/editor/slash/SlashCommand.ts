import { Extension } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";
import { ReactRenderer } from "@tiptap/react";
import { SlashMenu, SlashMenuRef } from "./SlashMenu";
import { getSlashItems, SlashItem } from "./items";

/** Position a floating popup at the caret rect (viewport coords). */
function renderSlashMenu() {
  let component: ReactRenderer<SlashMenuRef> | null = null;
  let popup: HTMLDivElement | null = null;

  const place = (rect: DOMRect | null | undefined) => {
    if (!popup || !rect) return;
    const margin = 8;
    const menuH = popup.offsetHeight || 320;
    const below = rect.bottom + 6;
    // Flip above the caret if it would overflow the viewport bottom.
    const top = below + menuH > window.innerHeight - margin ? rect.top - menuH - 6 : below;
    popup.style.left = `${Math.min(rect.left, window.innerWidth - 280 - margin)}px`;
    popup.style.top = `${Math.max(margin, top)}px`;
  };

  return {
    onStart: (props: any) => {
      component = new ReactRenderer(SlashMenu, { props, editor: props.editor });
      popup = document.createElement("div");
      popup.className = "slash-popup";
      popup.appendChild(component.element);
      document.body.appendChild(popup);
      place(props.clientRect?.());
    },
    onUpdate: (props: any) => {
      component?.updateProps(props);
      // Re-attach if it was dismissed with Escape but the user kept typing.
      if (popup && !popup.isConnected) document.body.appendChild(popup);
      place(props.clientRect?.());
    },
    onKeyDown: (props: any) => {
      if (props.event.key === "Escape") {
        popup?.remove();
        return true;
      }
      return component?.ref?.onKeyDown(props) ?? false;
    },
    onExit: () => {
      popup?.remove();
      component?.destroy();
      popup = null;
      component = null;
    },
  };
}

export const SlashCommand = Extension.create({
  name: "slashCommand",

  addProseMirrorPlugins() {
    return [
      Suggestion<SlashItem>({
        editor: this.editor,
        char: "/",
        startOfLine: false,
        // Only trigger when "/" starts a fresh word (avoids paths like a/b).
        allowSpaces: false,
        items: ({ query }) => getSlashItems(query),
        command: ({ editor, range, props }) => {
          props.command({ editor, range });
        },
        render: renderSlashMenu,
      }),
    ];
  },
});
