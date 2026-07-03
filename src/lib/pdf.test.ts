import { describe, expect, it } from "vitest";
import { buildPrintCss, preparePrintHtml, type PrintOptions } from "./pdf";

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

describe("preparePrintHtml", () => {
  it("devolve o HTML intocado quando não há nada a preparar", async () => {
    const html = "<p>texto simples</p>";
    expect(await preparePrintHtml(html, { numberHeadings: false })).toBe(html);
  });

  it("assa números de nota de rodapé em ordem de aparição", async () => {
    const html =
      '<p>a<sup data-fn-ref="x"></sup> b<sup data-fn-ref="y"></sup> c<sup data-fn-ref="x"></sup></p>' +
      '<section data-footnotes=""><div data-footnote="y"><p>nota y</p></div>' +
      '<div data-footnote="x"><p>nota x</p></div></section>';
    const doc = parse(await preparePrintHtml(html, { numberHeadings: false }));
    const refs = Array.from(doc.querySelectorAll("sup[data-fn-ref]")).map((el) => el.textContent);
    expect(refs).toEqual(["1", "2", "1"]);
    const nums = Array.from(doc.querySelectorAll(".footnote-num")).map((el) => el.textContent);
    expect(nums).toEqual(["2. ", "1. "]);
  });

  it("esvazia o rótulo dos marcadores de quebra de página", async () => {
    const html = '<div data-page-break=""><span class="page-break-label">Quebra de página</span></div>';
    const doc = parse(await preparePrintHtml(html, { numberHeadings: false }));
    expect(doc.querySelector("[data-page-break]")?.childNodes.length).toBe(0);
  });

  it("assa numeração de títulos espelhando o contador do editor", async () => {
    const html = "<h1>Um</h1><h2>Um-Um</h2><h1>Dois</h1>";
    const doc = parse(await preparePrintHtml(html, { numberHeadings: true }));
    const texts = Array.from(doc.querySelectorAll("h1, h2")).map((el) => el.textContent);
    expect(texts).toEqual(["1 Um", "1.1 Um-Um", "2 Dois"]);
  });

  it("não numera títulos dentro de notas de rodapé ou bibliografia", async () => {
    const html =
      "<h1>Um</h1>" +
      '<section data-footnotes=""><h2>Notas</h2><div data-footnote="a"><p>x</p></div></section>';
    const doc = parse(await preparePrintHtml(html, { numberHeadings: true }));
    expect(doc.querySelector("section h2")?.textContent).toBe("Notas");
  });

  it("preenche o sumário com âncoras para todos os títulos", async () => {
    const html = '<nav data-toc=""></nav><h1>Intro</h1><h2>Detalhe</h2>';
    const doc = parse(await preparePrintHtml(html, { numberHeadings: false }));
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

  it("assa números de legenda e monta listas de figuras/tabelas", async () => {
    const html =
      '<p data-caption="figure">um gato</p>' +
      '<p data-caption="table">medições</p>' +
      '<p data-caption="figure">um cão</p>' +
      '<nav data-toc="figures"></nav><nav data-toc="tables"></nav>';
    const doc = parse(await preparePrintHtml(html, { numberHeadings: false }));
    const caps = Array.from(doc.querySelectorAll("p[data-caption]")).map((el) => el.textContent);
    expect(caps).toEqual(["Figura 1 — um gato", "Tabela 1 — medições", "Figura 2 — um cão"]);

    const figNav = doc.querySelector('nav[data-toc="figures"]')!;
    expect(figNav.querySelector(".toc-header")?.textContent).toBe("Lista de Figuras");
    const figEntries = Array.from(figNav.querySelectorAll("a.toc-entry"));
    expect(figEntries.map((a) => a.textContent)).toEqual(["Figura 1 — um gato", "Figura 2 — um cão"]);
    // Âncoras apontam para as legendas de verdade.
    for (const a of figEntries) {
      expect(doc.getElementById(a.getAttribute("href")!.slice(1))).not.toBeNull();
    }

    const tabNav = doc.querySelector('nav[data-toc="tables"]')!;
    expect(tabNav.querySelector(".toc-header")?.textContent).toBe("Lista de Tabelas");
    expect(tabNav.querySelectorAll("a.toc-entry").length).toBe(1);
  });

  it("sumário comum continua listando títulos, não legendas", async () => {
    const html = '<nav data-toc=""></nav><h1>Intro</h1><p data-caption="figure">gato</p>';
    const doc = parse(await preparePrintHtml(html, { numberHeadings: false }));
    const entries = Array.from(doc.querySelectorAll('nav[data-toc=""] a.toc-entry'));
    expect(entries.length).toBe(1);
    expect(entries[0].textContent).toContain("Intro");
  });

  it("resolve referências cruzadas para âncoras com rótulo", async () => {
    const html =
      '<h1 data-ref-id="ref-h1">Intro</h1>' +
      '<p data-caption="figure" data-ref-id="ref-fig">um gato</p>' +
      '<p>ver <span data-crossref="ref-fig"></span> na <span data-crossref="ref-h1"></span>' +
      ' e <span data-crossref="ref-morto"></span></p>';
    const doc = parse(await preparePrintHtml(html, { numberHeadings: false }));
    const links = Array.from(doc.querySelectorAll("a.crossref"));
    expect(links.map((a) => a.textContent)).toEqual(["Figura 1", "Seção 1"]);
    // As âncoras apontam para elementos reais.
    for (const a of links) {
      expect(doc.getElementById(a.getAttribute("href")!.slice(1))).not.toBeNull();
    }
    // Referência pendurada vira texto visível, não some.
    expect(doc.querySelector("p:last-of-type")?.textContent).toContain("ref?");
  });

  it("assa números de página do editor no sumário e listas (com deslocamento ABNT)", async () => {
    const html =
      '<nav data-toc=""></nav><nav data-toc="figures"></nav>' +
      '<h1>Intro</h1><p data-caption="figure">gato</p><h2>Métodos</h2>';
    const doc = parse(
      await preparePrintHtml(html, { numberHeadings: false, tocPages: [3, 4], captionPages: [3] })
    );
    const sum = [...doc.querySelectorAll('nav[data-toc=""] a.toc-entry')];
    expect(sum.every((a) => a.classList.contains("baked"))).toBe(true);
    expect(sum.map((a) => a.querySelector(".toc-page")?.textContent)).toEqual(["3", "4"]);
    const fig = doc.querySelector('nav[data-toc="figures"] a.toc-entry .toc-page');
    expect(fig?.textContent).toBe("3");
  });

  it("sem tocPages (formato clássico) o sumário fica no fallback target-counter", async () => {
    const html = '<nav data-toc=""></nav><h1>Intro</h1>';
    const doc = parse(await preparePrintHtml(html, { numberHeadings: false }));
    const a = doc.querySelector("a.toc-entry")!;
    expect(a.classList.contains("baked")).toBe(false);
    expect(a.querySelector(".toc-page")).toBeNull();
  });

  it("citações sem engine carregada viram texto pandoc cru", async () => {
    const html = '<p>ver <span data-citation="" data-keys="silva2020"></span></p>';
    const doc = parse(await preparePrintHtml(html, { numberHeadings: false }));
    expect(doc.querySelector("p")?.textContent).toBe("ver [@silva2020]");
  });
});

describe("buildPrintCss (chrome por página)", () => {
  const base: PrintOptions = {
    title: "Doc",
    pageFormat: "a4",
    margins: { top: 113, bottom: 76, left: 113, right: 76 },
    header: { left: "", center: "", right: "{page}" },
    footer: { left: "", center: "", right: "" },
    chromeFrom: 1,
    numberStart: 1,
    numberHeadings: false,
    styles: null,
  };

  it("sem deslocamento: contador CSS e nenhuma regra por página", () => {
    const css = buildPrintCss(base);
    expect(css).toContain("@top-right { content: counter(page); }");
    expect(css).not.toContain(":nth(");
    expect(css).not.toContain("@page :first");
  });

  it("chromeFrom 2 (capa sem número) apaga o chrome da primeira página", () => {
    const css = buildPrintCss({ ...base, chromeFrom: 2, numberStart: 2 });
    expect(css).toContain("@page :first");
    expect(css).toContain("@page :nth(1)");
    expect(css).toContain("@top-right { content: none; }");
    // Da página 2 em diante continua no contador (sem deslocamento).
    expect(css).toContain("@top-right { content: counter(page); }");
  });

  it("ABNT (a partir da 4, numerada como 3): páginas pré-textuais em branco e números literais", () => {
    const css = buildPrintCss({ ...base, chromeFrom: 4, numberStart: 3, pageCount: 6 });
    for (const k of [1, 2, 3]) expect(css).toContain(`@page :nth(${k})`);
    expect(css).toContain('@page :nth(4) { @top-right { content: "3"; } }');
    expect(css).toContain('@page :nth(5) { @top-right { content: "4"; } }');
    expect(css).toContain('@page :nth(6) { @top-right { content: "5"; } }');
    // O contador físico saiu de cena para o {page} deslocado.
    expect(css).not.toContain("counter(page)");
  });

  it("{pages} deslocado usa o total do editor; sem pageCount cai no contador físico", () => {
    const footer = { left: "", center: "{page} de {pages}", right: "" };
    const withCount = buildPrintCss({ ...base, footer, header: { left: "", center: "", right: "" }, chromeFrom: 2, numberStart: 1, pageCount: 5 });
    expect(withCount).toContain('content: "1" " de " "4"');
    const withoutCount = buildPrintCss({ ...base, footer, header: { left: "", center: "", right: "" }, chromeFrom: 2, numberStart: 1 });
    expect(withoutCount).toContain('content: "1" " de " counter(pages)');
  });
});
