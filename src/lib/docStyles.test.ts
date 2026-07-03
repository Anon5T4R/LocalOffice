import { describe, expect, it } from "vitest";
import { docStylesCss } from "./docStyles";

describe("docStylesCss", () => {
  it("sem estilos -> string vazia (nenhum override)", () => {
    expect(docStylesCss(".x", null)).toBe("");
    expect(docStylesCss(".x", undefined)).toBe("");
    expect(docStylesCss(".x", {})).toBe("");
  });

  it("emite só as propriedades definidas, no seletor certo", () => {
    const css = docStylesCss(".ProseMirror", {
      paragraph: { align: "justify", firstLineIndentCm: 1.25 },
      h1: { fontSizePx: 28 },
    });
    expect(css).toContain(".ProseMirror p:not([data-caption]) { text-align: justify; text-indent: 1.25cm; }");
    expect(css).toContain(".ProseMirror h1 { font-size: 28px; }");
    expect(css).not.toContain("h2");
  });

  it("legenda usa o seletor data-caption e não colide com parágrafo", () => {
    const css = docStylesCss(".p", { caption: { fontSizePx: 11 }, paragraph: { fontSizePx: 14 } });
    expect(css).toContain('.p p[data-caption] { font-size: 11px; }');
    expect(css).toContain(".p p:not([data-caption]) { font-size: 14px; }");
  });

  it("mesmo CSS para editor e print (só muda o scope) — contrato da convergência", () => {
    const styles = { paragraph: { lineHeight: 2 }, blockquote: { fontFamily: "Serif" } };
    const editor = docStylesCss(".ProseMirror", styles);
    const print = docStylesCss(".print-content", styles);
    expect(print).toBe(editor.split(".ProseMirror").join(".print-content"));
  });

  it("gerados: fonte cascateia no bloco inteiro, estilo completo só nos títulos", () => {
    const css = docStylesCss(".p", {
      generated: { fontFamily: "Times New Roman", fontSizePx: 16, lineHeight: 1.5, align: "center" },
    });
    // Bloco inteiro (entradas do sumário, referências) recebe só a fonte.
    expect(css).toContain(
      ".p .toc-block, .p nav.toc, .p .bibliography-block, .p section.bibliography " +
        "{ font-family: Times New Roman; font-size: 16px; line-height: 1.5; }"
    );
    // Títulos (editor E print, mesma classe nos dois lados) levam tudo,
    // inclusive o alinhamento — e com pai qualificado, para vencer as regras
    // base de 1.1em/1.4em independentemente da ordem das folhas.
    expect(css).toContain(".p .toc-block .toc-header");
    expect(css).toContain(".p nav.toc .toc-header");
    expect(css).toContain(".p .bibliography-block .bibliography-header");
    expect(css).toContain(".p section.bibliography .bibliography-header");
    expect(css).toContain("text-align: center;");
  });

  it("gerados: mesmo CSS para editor e print (contrato da convergência)", () => {
    const styles = { generated: { fontFamily: "Serif", fontSizePx: 16 } };
    const editor = docStylesCss(".ProseMirror", styles);
    const print = docStylesCss(".print-content", styles);
    expect(print).toBe(editor.split(".ProseMirror").join(".print-content"));
  });
});
