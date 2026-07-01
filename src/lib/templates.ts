import { Editor } from "@tiptap/core";
import { PageFormat, PageMargins } from "./settings";

export interface DocTemplate {
  name: string;
  description: string;
  pageFormat: PageFormat;
  margins: PageMargins;
  fontFamily?: string;
  fontSize?: string;
  lineHeight?: string;
  textAlign?: "left" | "center" | "right" | "justify";
}

export const TEMPLATES: Record<string, DocTemplate> = {
  abnt: {
    name: "ABNT (NBR 14724)",
    description: "Trabalhos acadêmicos — 3cm top/left, 2cm bottom/right",
    pageFormat: "a4",
    margins: { top: 113, bottom: 76, left: 113, right: 76 },
    fontFamily: "Times New Roman",
    fontSize: "12px",
    lineHeight: "1.5",
    textAlign: "justify",
  },
  apa: {
    name: "APA 7ª ed.",
    description: "Psicologia, educação — 1 polegada (2.54cm) todas",
    pageFormat: "letter",
    margins: { top: 96, bottom: 96, left: 96, right: 96 },
    fontFamily: "Times New Roman",
    fontSize: "12px",
    lineHeight: "2.0",
    textAlign: "left",
  },
  artigo: {
    name: "Artigo científico",
    description: "Periódicos — A4, 2.5cm margens, Times 12",
    pageFormat: "a4",
    margins: { top: 94, bottom: 94, left: 94, right: 94 },
    fontFamily: "Times New Roman",
    fontSize: "12px",
    lineHeight: "1.5",
    textAlign: "justify",
  },
  relatorio: {
    name: "Relatório técnico",
    description: "Empresarial — A4, margens moderadas, Arial 11",
    pageFormat: "a4",
    margins: { top: 57, bottom: 57, left: 71, right: 57 },
    fontFamily: "Arial",
    fontSize: "11px",
    lineHeight: "1.15",
    textAlign: "left",
  },
  carta: {
    name: "Carta comercial",
    description: "Carta (216×279mm), margens 1in, Times 12",
    pageFormat: "letter",
    margins: { top: 96, bottom: 96, left: 96, right: 96 },
    fontFamily: "Times New Roman",
    fontSize: "12px",
    lineHeight: "1.15",
    textAlign: "left",
  },
};

/** Apply a template's content formatting (font, size, line-height, alignment) to the entire document. */
export function applyTemplateContent(editor: Editor, tmpl: DocTemplate): void {
  const { doc } = editor.state;
  const ops: (() => boolean)[] = [];

  doc.descendants((node, pos) => {
    if (node.type.isText) return;

    // Font family + size via textStyle mark
    if (tmpl.fontFamily || tmpl.fontSize) {
      const markAttrs: Record<string, string> = {};
      if (tmpl.fontFamily) markAttrs.fontFamily = tmpl.fontFamily;
      if (tmpl.fontSize) markAttrs.fontSize = tmpl.fontSize;
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

  // Run all operations
  ops.forEach((fn) => fn());
}
