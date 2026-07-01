import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import FontFamily from "@tiptap/extension-font-family";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { SlashCommand } from "./slash/SlashCommand";
import { SearchExtension } from "./search/SearchExtension";
import { PageBreak } from "./PageBreak";
import { FontSize } from "./FontSize";
import { LetterSpacing } from "./LetterSpacing";
import { LineHeight } from "./LineHeight";

export function buildExtensions() {
  return [
    // StarterKit (v3) already bundles Underline and Link.
    StarterKit.configure({
      link: { openOnClick: false, autolink: true },
    }),
    Placeholder.configure({
      placeholder: 'Digite "/" para comandos, ou comece a escrever…',
    }),
    Image.configure({ inline: false, allowBase64: true }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    Highlight.configure({ multicolor: true }),
    TextStyle,
    Color,
    FontFamily.configure({ types: ["textStyle"] }),
    FontSize.configure({ types: ["textStyle"] }),
    LetterSpacing.configure({ types: ["textStyle"] }),
    LineHeight.configure({ types: ["paragraph", "heading"] }),
    TaskList,
    TaskItem.configure({ nested: true }),
    PageBreak,
    SlashCommand,
    SearchExtension,
  ];
}
