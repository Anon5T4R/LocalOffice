import { describe, expect, it } from "vitest";
import { bakeNativeFieldsForDocx } from "./docxFields";
import { htmlToMarkdown } from "./markdown";

// bakeNativeFieldsForDocx returns HTML: the raw XML lives inside a
// data-ooxml="..." attribute, HTML-attribute-escaped (quotes as &quot;).
// Assertions on the literal `w:id="1"` syntax need the markdown pass too,
// where the turndown rule reads the attribute back (un-escaped) and emits
// it verbatim inside backticks — that's the form pandoc actually reads.
function bakedMarkdown(html: string): string {
  return htmlToMarkdown(bakeNativeFieldsForDocx(html));
}

describe("bakeNativeFieldsForDocx", () => {
  it("deixa html sem legendas/referências intocado", () => {
    const html = "<p>texto normal</p>";
    expect(bakeNativeFieldsForDocx(html)).toBe(html);
  });

  it("gera campo SEQ para legenda sem refId", () => {
    const out = bakeNativeFieldsForDocx('<p data-caption="figure">Exemplo de figura</p>');
    expect(out).toContain("SEQ Figura");
    expect(out).toContain("Exemplo de figura");
    expect(out).not.toContain("data-caption");
    expect(out).not.toContain("bookmarkStart"); // sem refId, sem bookmark
  });

  it("numera figuras e tabelas em contadores independentes, em ordem de documento", () => {
    const html =
      '<p data-caption="figure">Primeira</p>' +
      '<p data-caption="table">Só tabela</p>' +
      '<p data-caption="figure">Segunda</p>';
    const md = bakedMarkdown(html);
    const seqRuns = [...md.matchAll(/SEQ (Figura|Tabela) \\\* ARABIC.*?<w:t>(\d+)<\/w:t>/gs)];
    expect(seqRuns.map((m) => `${m[1]} ${m[2]}`)).toEqual(["Figura 1", "Tabela 1", "Figura 2"]);
  });

  it("legenda com refId ganha bookmark em volta do campo SEQ", () => {
    const md = bakedMarkdown('<p data-caption="table" data-ref-id="ref-abc">Legenda</p>');
    expect(md).toMatch(/<w:bookmarkStart w:id="1" w:name="Ref_refabc"\/>.*SEQ Tabela/s);
    expect(md).toContain('<w:bookmarkEnd w:id="1"/>');
  });

  it("crossref para legenda vira campo REF com o texto resolvido em cache", () => {
    const html =
      '<p data-caption="figure" data-ref-id="ref-fig1">Minha figura</p>' +
      '<p>Ver <span data-crossref="ref-fig1"></span>.</p>';
    const md = bakedMarkdown(html);
    expect(md).toMatch(/REF Ref_reffig1 \\h.*<w:t xml:space="preserve">Figura 1<\/w:t>/s);
    expect(md).not.toContain("data-crossref");
  });

  it("crossref para título vira campo REF com o rótulo de seção", () => {
    const html = '<h1 data-ref-id="ref-h1">Introdução</h1><p>ver <span data-crossref="ref-h1"></span></p>';
    const md = bakedMarkdown(html);
    expect(md).toContain('<w:bookmarkStart w:id="1" w:name="Ref_refh1"/>');
    expect(md).toMatch(/REF Ref_refh1 \\h.*<w:t xml:space="preserve">Seção 1<\/w:t>/s);
  });

  it("crossref pendurado (alvo sem refId) vira texto 'ref?' em vez de campo quebrado", () => {
    const md = bakedMarkdown('<p>Ver <span data-crossref="inexistente"></span>.</p>');
    expect(md).toContain("ref?");
    expect(md).not.toContain("REF inexistente");
  });

  it("sanitiza o refId no nome do bookmark", () => {
    const md = bakedMarkdown('<p data-caption="figure" data-ref-id="ref abc!@#">Legenda</p>');
    expect(md).toContain('w:name="Ref_refabc"');
  });
});

describe("bakeNativeFieldsForDocx -> htmlToMarkdown (raw OOXML round-trip)", () => {
  it("emite os runs OOXML inline dentro de um parágrafo markdown comum (não vira bloco <w:p> cru)", () => {
    const md = bakedMarkdown('<p data-caption="figure">Legenda</p>');
    // A marca não deve estar sozinha numa linha própria como bloco raw --
    // deve estar embutida na mesma linha de texto ("Figura " ... " — Legenda").
    expect(md).toMatch(/Figura `<w:r>[\s\S]*— Legenda/);
  });
});
