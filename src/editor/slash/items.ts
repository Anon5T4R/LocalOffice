import type { Editor, Range } from "@tiptap/core";
import { pickImageDataUri } from "../../lib/images";

export interface SlashItem {
  title: string;
  subtitle: string;
  icon: string;
  keywords: string;
  command: (p: { editor: Editor; range: Range }) => void | Promise<void>;
}

const ITEMS: SlashItem[] = [
  {
    title: "Texto",
    subtitle: "Parágrafo simples",
    icon: "¶",
    keywords: "texto paragrafo paragraph normal",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setParagraph().run();
    },
  },
  {
    title: "Título 1",
    subtitle: "Cabeçalho grande",
    icon: "H1",
    keywords: "titulo heading h1 cabecalho",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 1 }).run();
    },
  },
  {
    title: "Título 2",
    subtitle: "Cabeçalho médio",
    icon: "H2",
    keywords: "titulo heading h2 cabecalho",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 2 }).run();
    },
  },
  {
    title: "Título 3",
    subtitle: "Cabeçalho pequeno",
    icon: "H3",
    keywords: "titulo heading h3 cabecalho",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 3 }).run();
    },
  },
  {
    title: "Lista com marcadores",
    subtitle: "Lista não ordenada",
    icon: "•",
    keywords: "lista bullet marcadores unordered",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run();
    },
  },
  {
    title: "Lista numerada",
    subtitle: "Lista ordenada",
    icon: "1.",
    keywords: "lista numerada ordered numero",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run();
    },
  },
  {
    title: "Lista de tarefas",
    subtitle: "Caixas marcáveis",
    icon: "☑",
    keywords: "tarefa task todo checkbox",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleTaskList().run();
    },
  },
  {
    title: "Citação",
    subtitle: "Bloco de citação",
    icon: "❝",
    keywords: "citacao quote blockquote",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run();
    },
  },
  {
    title: "Bloco de código",
    subtitle: "Código com largura fixa",
    icon: "{ }",
    keywords: "codigo code bloco pre",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
    },
  },
  {
    title: "Tabela",
    subtitle: "Insere uma tabela 3×3",
    icon: "▦",
    keywords: "tabela table grade",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    },
  },
  {
    title: "Imagem",
    subtitle: "Inserir do disco",
    icon: "🖼",
    keywords: "imagem image foto figura",
    command: async ({ editor, range }) => {
      const uri = await pickImageDataUri();
      if (uri) editor.chain().focus().deleteRange(range).setImage({ src: uri }).run();
    },
  },
  {
    title: "Linha divisória",
    subtitle: "Separador horizontal",
    icon: "—",
    keywords: "linha divisoria separador hr horizontal rule",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run();
    },
  },
  {
    title: "Quebra de página",
    subtitle: "Nova página no PDF",
    icon: "⤓",
    keywords: "quebra pagina page break pdf",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setPageBreak().run();
    },
  },
  {
    title: "Nota de rodapé",
    subtitle: "Referência + nota no fim",
    icon: "⁺",
    keywords: "nota rodape footnote referencia citacao",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).addFootnote().run();
    },
  },
  {
    title: "Sumário",
    subtitle: "Índice dos títulos (com páginas no PDF)",
    icon: "☰",
    keywords: "sumario indice toc table of contents titulos",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertTableOfContents().run();
    },
  },
  {
    title: "Citação bibliográfica",
    subtitle: 'Digite "[@" para buscar na bibliografia',
    icon: "❞",
    keywords: "citacao citation referencia bibliografia zotero bibtex",
    command: ({ editor, range }) => {
      // Inserting the trigger text opens the reference autocomplete.
      editor.chain().focus().deleteRange(range).insertContent("[@").run();
    },
  },
  {
    title: "Referências",
    subtitle: "Lista formatada das obras citadas",
    icon: "📚",
    keywords: "referencias bibliografia bibliography obras citadas",
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertBibliography().run();
    },
  },
];

export function getSlashItems(query: string): SlashItem[] {
  const q = query.toLowerCase().trim();
  if (!q) return ITEMS;
  return ITEMS.filter((i) => (i.title + " " + i.keywords).toLowerCase().includes(q));
}
