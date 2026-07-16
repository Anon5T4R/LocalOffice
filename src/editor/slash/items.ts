import type { Editor, Range } from "@tiptap/core";
import { pickImageDataUri } from "../../lib/images";
import { t } from "../../lib/i18n";

export interface SlashItem {
  title: string;
  subtitle: string;
  icon: string;
  keywords: string;
  command: (p: { editor: Editor; range: Range }) => void | Promise<void>;
}

// Built through a factory (not a module-const array) so the localized
// title/subtitle follow the UI language on remount. `keywords` stay in pt to
// keep type-ahead search stable; the (localized) title is also matched.
function buildItems(): SlashItem[] {
  return [
    {
      title: t("slash.text.t"),
      subtitle: t("slash.text.s"),
      icon: "¶",
      keywords: "texto paragrafo paragraph normal",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setParagraph().run();
      },
    },
    {
      title: t("slash.h1.t"),
      subtitle: t("slash.h1.s"),
      icon: "H1",
      keywords: "titulo heading h1 cabecalho",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setNode("heading", { level: 1 }).run();
      },
    },
    {
      title: t("slash.h2.t"),
      subtitle: t("slash.h2.s"),
      icon: "H2",
      keywords: "titulo heading h2 cabecalho",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setNode("heading", { level: 2 }).run();
      },
    },
    {
      title: t("slash.h3.t"),
      subtitle: t("slash.h3.s"),
      icon: "H3",
      keywords: "titulo heading h3 cabecalho",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setNode("heading", { level: 3 }).run();
      },
    },
    {
      title: t("slash.bullet.t"),
      subtitle: t("slash.bullet.s"),
      icon: "•",
      keywords: "lista bullet marcadores unordered",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleBulletList().run();
      },
    },
    {
      title: t("slash.ordered.t"),
      subtitle: t("slash.ordered.s"),
      icon: "1.",
      keywords: "lista numerada ordered numero",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleOrderedList().run();
      },
    },
    {
      title: t("slash.task.t"),
      subtitle: t("slash.task.s"),
      icon: "☑",
      keywords: "tarefa task todo checkbox",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleTaskList().run();
      },
    },
    {
      title: t("slash.quote.t"),
      subtitle: t("slash.quote.s"),
      icon: "❝",
      keywords: "citacao quote blockquote",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleBlockquote().run();
      },
    },
    {
      title: t("slash.code.t"),
      subtitle: t("slash.code.s"),
      icon: "{ }",
      keywords: "codigo code bloco pre",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
      },
    },
    {
      title: t("slash.table.t"),
      subtitle: t("slash.table.s"),
      icon: "▦",
      keywords: "tabela table grade",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
      },
    },
    {
      title: t("slash.image.t"),
      subtitle: t("slash.image.s"),
      icon: "🖼",
      keywords: "imagem image foto figura",
      command: async ({ editor, range }) => {
        const uri = await pickImageDataUri();
        if (uri) editor.chain().focus().deleteRange(range).setImage({ src: uri }).run();
      },
    },
    {
      title: t("slash.hr.t"),
      subtitle: t("slash.hr.s"),
      icon: "—",
      keywords: "linha divisoria separador hr horizontal rule",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setHorizontalRule().run();
      },
    },
    {
      title: t("slash.pageBreak.t"),
      subtitle: t("slash.pageBreak.s"),
      icon: "⤓",
      keywords: "quebra pagina page break pdf",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setPageBreak().run();
      },
    },
    {
      title: t("slash.math.t"),
      subtitle: t("slash.math.s"),
      icon: "√x",
      keywords: "equacao formula matematica math latex katex",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).insertMath().run();
      },
    },
    {
      title: t("slash.footnote.t"),
      subtitle: t("slash.footnote.s"),
      icon: "⁺",
      keywords: "nota rodape footnote referencia citacao",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).addFootnote().run();
      },
    },
    {
      title: t("slash.caption.t"),
      subtitle: t("slash.caption.s"),
      icon: "🏷",
      keywords: "legenda caption figura tabela numeracao",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).insertCaption().run();
      },
    },
    {
      title: t("slash.toc.t"),
      subtitle: t("slash.toc.s"),
      icon: "☰",
      keywords: "sumario indice toc table of contents titulos",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).insertTableOfContents().run();
      },
    },
    {
      title: t("slash.figList.t"),
      subtitle: t("slash.figList.s"),
      icon: "🖼",
      keywords: "lista figuras ilustracoes indice",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).insertTableOfContents("figures").run();
      },
    },
    {
      title: t("slash.tabList.t"),
      subtitle: t("slash.tabList.s"),
      icon: "▦",
      keywords: "lista tabelas indice",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).insertTableOfContents("tables").run();
      },
    },
    {
      title: t("slash.citation.t"),
      subtitle: t("slash.citation.s"),
      icon: "❞",
      keywords: "citacao citation referencia bibliografia zotero bibtex",
      command: ({ editor, range }) => {
        // Inserting the trigger text opens the reference autocomplete.
        editor.chain().focus().deleteRange(range).insertContent("[@").run();
      },
    },
    {
      title: t("slash.refs.t"),
      subtitle: t("slash.refs.s"),
      icon: "📚",
      keywords: "referencias bibliografia bibliography obras citadas",
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).insertBibliography().run();
      },
    },
  ];
}

export function getSlashItems(query: string): SlashItem[] {
  const items = buildItems();
  const q = query.toLowerCase().trim();
  if (!q) return items;
  return items.filter((i) => (i.title + " " + i.keywords).toLowerCase().includes(q));
}
