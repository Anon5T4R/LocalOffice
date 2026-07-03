import { describe, expect, it } from "vitest";
import { prepareForPandoc } from "./exportPrep";

const NBSP = String.fromCharCode(160);

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

describe("prepareForPandoc", () => {
  it("devolve o HTML intocado quando não há nada a preparar", () => {
    const html = "<p>texto</p><h1>Título</h1>";
    expect(prepareForPandoc(html, "docx")).toBe(html);
  });

  it("docx: quebra de página vira marcador OOXML inline (rótulo some)", () => {
    const html =
      '<p>antes</p><div data-page-break="true"><span class="page-break-label">Quebra de página</span></div><p>depois</p>';
    const out = prepareForPandoc(html, "docx");
    expect(out).not.toContain("Quebra de página");
    const doc = parse(out);
    const marker = doc.querySelector("p > span[data-ooxml]");
    expect(marker?.getAttribute("data-ooxml")).toBe('<w:r><w:br w:type="page"/></w:r>');
  });

  it("odt/rtf: quebra de página é removida inteira (sem canal cru — rótulo nunca vaza)", () => {
    const html = '<div data-page-break="true"><span class="page-break-label">Quebra de página</span></div><p>x</p>';
    for (const fmt of ["odt", "rtf"] as const) {
      const out = prepareForPandoc(html, fmt);
      expect(out).not.toContain("Quebra");
      expect(out).not.toContain("data-page-break");
      expect(out).toContain("<p>x</p>");
    }
  });

  it("sumário vira título em negrito + uma linha por título, indentada por nível", () => {
    const html = '<nav data-toc=""></nav><h1>Intro</h1><h2>Detalhe</h2>';
    const doc = parse(prepareForPandoc(html, "docx"));
    expect(doc.querySelector("nav")).toBeNull();
    const ps = Array.from(doc.querySelectorAll("p"));
    expect(ps[0].querySelector("strong")?.textContent).toBe("Sumário");
    expect(ps[1].textContent).toBe("Intro");
    expect(ps[2].textContent).toBe(`${NBSP}${NBSP}${NBSP}Detalhe`);
  });

  it("listas de figuras/tabelas saem numeradas na ordem do documento", () => {
    const html =
      '<nav data-toc="figures"></nav><p data-caption="figure">um gato</p>' +
      '<p data-caption="table">medições</p><p data-caption="figure">um cão</p>';
    const doc = parse(prepareForPandoc(html, "docx"));
    const texts = Array.from(doc.querySelectorAll("p:not([data-caption])")).map((p) => p.textContent);
    expect(texts[0]).toBe("Lista de Figuras");
    expect(texts[1]).toBe("Figura 1 — um gato");
    expect(texts[2]).toBe("Figura 2 — um cão");
  });

  it("parágrafos vazios (linhas em branco do usuário) viram NBSP, com ou sem atributos", () => {
    const html = '<p>a</p><p></p><p style="text-align: center"></p><p>b</p>';
    const doc = parse(prepareForPandoc(html, "docx"));
    const ps = Array.from(doc.querySelectorAll("p"));
    expect(ps[1].textContent).toBe(NBSP);
    expect(ps[2].textContent).toBe(NBSP);
  });

  it("títulos de notas de rodapé e da bibliografia ficam fora do sumário", () => {
    const html =
      '<nav data-toc=""></nav><h1>Intro</h1>' +
      '<section data-footnotes=""><h2>Notas</h2></section>' +
      '<section class="bibliography"><h2>Referências</h2></section>';
    const doc = parse(prepareForPandoc(html, "docx"));
    const texts = Array.from(doc.querySelectorAll("p")).map((p) => p.textContent);
    expect(texts).toContain("Intro");
    expect(texts).not.toContain("Notas");
    expect(texts.filter((t) => t === "Referências")).toHaveLength(0);
  });
});
