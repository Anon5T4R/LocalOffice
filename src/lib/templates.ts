import { Editor } from "@tiptap/core";
import { ptToPx } from "./fontUnits";
import { HeaderFooterSpec, PageFormat, PageMargins } from "./settings";

/** Norm sizes are given in points; every internal metric is px (fontUnits). */
const pt = (n: number) => `${ptToPx(n)}px`;

export interface DocTemplate {
  name: string;
  description: string;
  pageFormat: PageFormat;
  margins: PageMargins;
  fontFamily?: string;
  fontSize?: string;
  lineHeight?: string;
  textAlign?: "left" | "center" | "right" | "justify";
  /** Print chrome presets; applied to settings together with format/margins. */
  header?: HeaderFooterSpec;
  footer?: HeaderFooterSpec;
  /** Print header/footer on the first page (ABNT/APA hide it on cover pages). */
  chromeOnFirst?: boolean;
  /** First PHYSICAL page that shows header/footer (ABNT: 4 — capa, folha de
   *  rosto e sumário ficam sem número). Undefined = clear (chromeOnFirst rules). */
  chromeFrom?: number;
  /** Number DISPLAYED on that first chrome page (ABNT: 3 — a capa não conta
   *  na numeração). Undefined = the physical page number. */
  numberStart?: number;
  /** Starter document (cover page etc.), inserted only when the doc is empty. */
  content?: () => string;
}

/** ABNT starter: capa, folha de rosto, sumário e seções pré-montadas. */
function abntContent(): string {
  const year = new Date().getFullYear();
  const center = (text: string, tag = "p") =>
    `<${tag} style="text-align: center">${text}</${tag}>`;
  const gap = (n: number) => "<p></p>".repeat(n);
  return [
    // Capa
    center("NOME DA INSTITUIÇÃO"),
    center("NOME DO AUTOR"),
    gap(8),
    center("<strong>TÍTULO DO TRABALHO: subtítulo</strong>"),
    gap(10),
    center("Cidade"),
    center(String(year)),
    '<div data-page-break="true"></div>',
    // Folha de rosto
    center("NOME DO AUTOR"),
    gap(8),
    center("<strong>TÍTULO DO TRABALHO: subtítulo</strong>"),
    gap(4),
    '<p style="margin-left: 8cm">Trabalho apresentado ao Curso X da Instituição Y como requisito parcial para obtenção do título de Z.</p>',
    '<p style="margin-left: 8cm">Orientador(a): Prof(a). Nome</p>',
    gap(6),
    center("Cidade"),
    center(String(year)),
    '<div data-page-break="true"></div>',
    // Sumário + estrutura textual
    '<nav data-toc=""></nav>',
    '<div data-page-break="true"></div>',
    "<h1>Introdução</h1>",
    '<p style="text-indent: 1.25cm">Apresente o tema, o problema, os objetivos e a justificativa.</p>',
    "<h1>Desenvolvimento</h1>",
    '<p style="text-indent: 1.25cm">Fundamentação teórica e metodologia. Cite com "[@" quando houver bibliografia configurada.</p>',
    "<h1>Conclusão</h1>",
    '<p style="text-indent: 1.25cm">Retome os objetivos e sintetize os resultados.</p>',
    '<div data-bibliography=""></div>',
  ].join("");
}

export const TEMPLATES: Record<string, DocTemplate> = {
  abnt: {
    name: "ABNT (NBR 14724)",
    description: "Trabalhos acadêmicos — 3cm top/left, 2cm bottom/right, fonte 12pt",
    pageFormat: "a4",
    margins: { top: 113, bottom: 76, left: 113, right: 76 },
    fontFamily: "Times New Roman",
    fontSize: pt(12),
    lineHeight: "1.5",
    textAlign: "justify",
    header: { left: "", center: "", right: "{page}" },
    footer: { left: "", center: "", right: "" },
    chromeOnFirst: false,
    // NBR 14724: conta-se a partir da folha de rosto (a capa não conta) e o
    // número só aparece a partir da parte textual — no starter: capa (1),
    // folha de rosto (2), sumário (3), Introdução (4, exibida como "3").
    chromeFrom: 4,
    numberStart: 3,
    content: abntContent,
  },
  apa: {
    name: "APA 7ª ed.",
    description: "Psicologia, educação — 1 polegada (2.54cm) todas, fonte 12pt",
    pageFormat: "letter",
    margins: { top: 96, bottom: 96, left: 96, right: 96 },
    fontFamily: "Times New Roman",
    fontSize: pt(12),
    lineHeight: "2.0",
    textAlign: "left",
    header: { left: "{title}", center: "", right: "{page}" },
    footer: { left: "", center: "", right: "" },
    chromeOnFirst: true,
  },
  artigo: {
    name: "Artigo científico",
    description: "Periódicos — A4, 2.5cm margens, Times 12pt",
    pageFormat: "a4",
    margins: { top: 94, bottom: 94, left: 94, right: 94 },
    fontFamily: "Times New Roman",
    fontSize: pt(12),
    lineHeight: "1.5",
    textAlign: "justify",
    footer: { left: "", center: "{page}", right: "" },
  },
  relatorio: {
    name: "Relatório técnico",
    description: "Empresarial — A4, margens moderadas, Arial 11pt",
    pageFormat: "a4",
    margins: { top: 57, bottom: 57, left: 71, right: 57 },
    fontFamily: "Arial",
    fontSize: pt(11),
    lineHeight: "1.15",
    textAlign: "left",
    header: { left: "{title}", center: "", right: "" },
    footer: { left: "", center: "", right: "{page} de {pages}" },
  },
  carta: {
    name: "Carta comercial",
    description: "Carta (216×279mm), margens 1in, Times 12pt",
    pageFormat: "letter",
    margins: { top: 96, bottom: 96, left: 96, right: 96 },
    fontFamily: "Times New Roman",
    fontSize: pt(12),
    lineHeight: "1.15",
    textAlign: "left",
  },
};

/** Apply a template's content formatting (font, size, line-height, alignment) to the entire document. */
export function applyTemplateContent(editor: Editor, tmpl: DocTemplate): void {
  const { doc } = editor.state;
  const ops: (() => boolean)[] = [];

  doc.descendants((node, pos) => {
    if (!node.type.isText && node.content.size === 0) return;

    // Font family + size via textStyle mark
    const markAttrs: Record<string, string> = {};
    if (tmpl.fontFamily) markAttrs.fontFamily = tmpl.fontFamily;
    if (tmpl.fontSize) markAttrs.fontSize = tmpl.fontSize;
    if (Object.keys(markAttrs).length > 0) {
      const from = pos;
      const to = pos + node.nodeSize;
      ops.push(() =>
        editor.chain().setTextSelection({ from, to }).setMark("textStyle", markAttrs).run()
      );
    }

    // Line height via node attribute
    if (tmpl.lineHeight && (node.type.name === "paragraph" || node.type.name === "heading")) {
      ops.push(() =>
        editor.chain().setTextSelection({ from: pos, to: pos + node.nodeSize })
          .updateAttributes(node.type.name, { lineHeight: tmpl.lineHeight }).run()
      );
    }

    // Text alignment via node attribute
    if (tmpl.textAlign && (node.type.name === "paragraph" || node.type.name === "heading")) {
      ops.push(() =>
        editor.chain().setTextSelection({ from: pos, to: pos + node.nodeSize })
          .setTextAlign(tmpl.textAlign!).run()
      );
    }
  });

  // Run all operations, then leave the caret where the user expects to start
  // reading/typing — the per-node ops above drag the selection through the
  // whole document and would otherwise abandon it on the last block.
  ops.forEach((fn) => fn());
  editor.commands.focus("start", { scrollIntoView: true });
}
