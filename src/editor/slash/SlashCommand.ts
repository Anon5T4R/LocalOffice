import { Extension } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";
import { suggestionPopup } from "./popup";
import { getSlashItems, SlashItem } from "./items";

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
        render: suggestionPopup,
      }),
    ];
  },
});
