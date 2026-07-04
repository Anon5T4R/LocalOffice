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

  it("docx: parágrafo centralizado vira OOXML nativo com w:jc center", () => {
    const html = '<p style="text-align: center"><span>NOME DA INSTITUIÇÃO</span></p>';
    const doc = parse(prepareForPandoc(html, "docx"));
    const block = doc.querySelector("div[data-raw-block]");
    const xml = block?.getAttribute("data-raw-block") ?? "";
    expect(block?.getAttribute("data-raw-fmt")).toBe("openxml");
    expect(xml).toContain('<w:jc w:val="center"/>');
    expect(xml).toContain("NOME DA INSTITUIÇÃO");
    expect(xml.startsWith("<w:p>")).toBe(true);
  });

  it("docx: negrito e itálico viram w:b / w:i nos runs", () => {
    const html = '<p style="text-align: center"><strong>TÍTULO</strong> e <em>sub</em></p>';
    const xml =
      parse(prepareForPandoc(html, "docx"))
        .querySelector("div[data-raw-block]")
        ?.getAttribute("data-raw-block") ?? "";
    expect(xml).toContain("<w:rPr><w:b/></w:rPr><w:t xml:space=\"preserve\">TÍTULO</w:t>");
    expect(xml).toContain("<w:rPr><w:i/></w:rPr><w:t xml:space=\"preserve\">sub</w:t>");
  });

  it("docx: margin-left e text-indent viram w:ind em twips (1cm=567tw)", () => {
    const html =
      '<p style="margin-left: 8cm">natureza</p><p style="text-indent: 1.25cm">corpo</p>';
    const blocks = Array.from(
      parse(prepareForPandoc(html, "docx")).querySelectorAll("div[data-raw-block]")
    ).map((b) => b.getAttribute("data-raw-block") ?? "");
    expect(blocks[0]).toContain(`<w:ind w:left="${8 * 567}"/>`);
    expect(blocks[1]).toContain(`<w:ind w:firstLine="${Math.round(1.25 * 567)}"/>`);
  });

  it("docx: parágrafo só com espaço/NBSP não vira OOXML (fica linha em branco)", () => {
    const html = '<p style="text-align: center"></p><p style="text-align: center">real</p>';
    const doc = parse(prepareForPandoc(html, "docx"));
    // O vazio virou NBSP simples; só o com texto virou bloco OOXML.
    expect(doc.querySelectorAll("div[data-raw-block]").length).toBe(1);
    expect(doc.querySelector("p")?.textContent).toBe(NBSP);
  });

  it("odt: alinhamento vira <text:p> com estilo nomeado predefinido", () => {
    const html =
      '<p style="text-align: center">NOME</p>' +
      '<p style="margin-left: 8cm">natureza</p>' +
      '<p style="text-indent: 1.25cm; text-align: justify">corpo</p>';
    const blocks = Array.from(
      parse(prepareForPandoc(html, "odt")).querySelectorAll("div[data-raw-block]")
    );
    expect(blocks.every((b) => b.getAttribute("data-raw-fmt") === "opendocument")).toBe(true);
    const xmls = blocks.map((b) => b.getAttribute("data-raw-block") ?? "");
    expect(xmls[0]).toBe('<text:p text:style-name="LOc">NOME</text:p>');
    expect(xmls[1]).toBe('<text:p text:style-name="LOml">natureza</text:p>');
    expect(xmls[2]).toBe('<text:p text:style-name="LOjfi">corpo</text:p>');
  });

  it("odt: negrito vira <text:span> com estilo LOb", () => {
    const html = '<p style="text-align: center"><strong>TÍTULO</strong></p>';
    const xml =
      parse(prepareForPandoc(html, "odt"))
        .querySelector("div[data-raw-block]")
        ?.getAttribute("data-raw-block") ?? "";
    expect(xml).toContain('<text:span text:style-name="LOb">TÍTULO</text:span>');
  });

  it("odt: quebra de página vira parágrafo com estilo de quebra (LObreak)", () => {
    const html = '<p>a</p><div data-page-break="true"></div><p>b</p>';
    const block = parse(prepareForPandoc(html, "odt")).querySelector("div[data-raw-block]");
    expect(block?.getAttribute("data-raw-block")).toBe('<text:p text:style-name="LObreak"/>');
  });

  it("odt: recuo arbitrário sem estilo casável fica parágrafo simples", () => {
    const html = '<p style="text-indent: 3.7cm">corpo</p>';
    const doc = parse(prepareForPandoc(html, "odt"));
    expect(doc.querySelector("div[data-raw-block]")).toBeNull();
    expect(doc.querySelector("p")?.textContent).toBe("corpo");
  });

  it("rtf: alinhamento NÃO é assado (sem canal cru; fica semântico)", () => {
    const html = '<p style="text-align: center">NOME</p>';
    const out = prepareForPandoc(html, "rtf");
    expect(out).not.toContain("data-raw-block");
    expect(out).toContain("NOME");
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
