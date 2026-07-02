import { describe, expect, it } from "vitest";
import { preparePrintHtml } from "./pdf";

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

describe("preparePrintHtml", () => {
  it("devolve o HTML intocado quando não há nada a preparar", () => {
    const html = "<p>texto simples</p>";
    expect(preparePrintHtml(html, { numberHeadings: false })).toBe(html);
  });

  it("assa números de nota de rodapé em ordem de aparição", () => {
    const html =
      '<p>a<sup data-fn-ref="x"></sup> b<sup data-fn-ref="y"></sup> c<sup data-fn-ref="x"></sup></p>' +
      '<section data-footnotes=""><div data-footnote="y"><p>nota y</p></div>' +
      '<div data-footnote="x"><p>nota x</p></div></section>';
    const doc = parse(preparePrintHtml(html, { numberHeadings: false }));
    const refs = Array.from(doc.querySelectorAll("sup[data-fn-ref]")).map((el) => el.textContent);
    expect(refs).toEqual(["1", "2", "1"]);
    const nums = Array.from(doc.querySelectorAll(".footnote-num")).map((el) => el.textContent);
    expect(nums).toEqual(["2. ", "1. "]);
  });

  it("esvazia o rótulo dos marcadores de quebra de página", () => {
    const html = '<div data-page-break=""><span class="page-break-label">Quebra de página</span></div>';
    const doc = parse(preparePrintHtml(html, { numberHeadings: false }));
    expect(doc.querySelector("[data-page-break]")?.childNodes.length).toBe(0);
  });

  it("assa numeração de títulos espelhando o contador do editor", () => {
    const html = "<h1>Um</h1><h2>Um-Um</h2><h1>Dois</h1>";
    const doc = parse(preparePrintHtml(html, { numberHeadings: true }));
    const texts = Array.from(doc.querySelectorAll("h1, h2")).map((el) => el.textContent);
    expect(texts).toEqual(["1 Um", "1.1 Um-Um", "2 Dois"]);
  });

  it("não numera títulos dentro de notas de rodapé ou bibliografia", () => {
    const html =
      "<h1>Um</h1>" +
      '<section data-footnotes=""><h2>Notas</h2><div data-footnote="a"><p>x</p></div></section>';
    const doc = parse(preparePrintHtml(html, { numberHeadings: true }));
    expect(doc.querySelector("section h2")?.textContent).toBe("Notas");
  });

  it("preenche o sumário com âncoras para todos os títulos", () => {
    const html = '<nav data-toc=""></nav><h1>Intro</h1><h2>Detalhe</h2>';
    const doc = parse(preparePrintHtml(html, { numberHeadings: false }));
    const entries = Array.from(doc.querySelectorAll("nav.toc a.toc-entry"));
    expect(entries.length).toBe(2);
    expect(entries[0].textContent).toContain("Intro");
    expect(entries[1].className).toContain("lvl-2");
    // Cada âncora aponta para um id existente no corpo.
    for (const a of entries) {
      const id = a.getAttribute("href")!.slice(1);
      expect(doc.getElementById(id)).not.toBeNull();
    }
  });

  it("citações sem engine carregada viram texto pandoc cru", () => {
    const html = '<p>ver <span data-citation="" data-keys="silva2020"></span></p>';
    const doc = parse(preparePrintHtml(html, { numberHeadings: false }));
    expect(doc.querySelector("p")?.textContent).toBe("ver [@silva2020]");
  });
});
