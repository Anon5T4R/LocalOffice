import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { ResizableImage } from "./ResizableImage";
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
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import { FootnoteRef, Footnote, Footnotes } from "./Footnotes";
import { MathInline } from "./Math";
import { HeadingNumbers } from "./HeadingNumbers";
import { DocLayoutExtension } from "./DocLayout";
import { TableOfContents } from "./TableOfContents";
import { Citation, CitationSuggestion } from "./Citation";
import { Bibliography } from "./Bibliography";
import { CommentMark, InsertionMark, DeletionMark, TrackChanges } from "./Review";
import { SlashCommand } from "./slash/SlashCommand";
import { loadSettings } from "../lib/settings";
import { SearchExtension } from "./search/SearchExtension";
import { PageBreak } from "./PageBreak";
import { FontSize } from "./FontSize";
import { LetterSpacing } from "./LetterSpacing";
import { LineHeight } from "./LineHeight";
import { Indent } from "./Indent";

export function buildExtensions() {
  return [
    // StarterKit (v3) already bundles Underline and Link.
    StarterKit.configure({
      link: { openOnClick: false, autolink: true },
      // Default depth (100) loses history after a burst of edits; raise it
      // so Ctrl+Z reaches meaningfully further back in a writing session.
      undoRedo: { depth: 500 },
    }),
    Placeholder.configure({
      placeholder: 'Digite "/" para comandos, ou comece a escrever…',
    }),
    ResizableImage.configure({ inline: false, allowBase64: true }),
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
    Indent,
    TaskList,
    TaskItem.configure({ nested: true }),
    Subscript,
    Superscript,
    FootnoteRef,
    Footnote,
    Footnotes,
    MathInline,
    HeadingNumbers,
    TableOfContents,
    Citation,
    CitationSuggestion,
    Bibliography,
    CommentMark,
    InsertionMark,
    DeletionMark,
    TrackChanges.configure({
      // Read on every change so renaming the author in settings applies live.
      getAuthor: () => loadSettings().authorName || "Autor",
    }),
    PageBreak,
    SlashCommand,
    SearchExtension,
    DocLayoutExtension,
  ];
}
