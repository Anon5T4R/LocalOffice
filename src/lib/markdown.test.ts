import { describe, expect, it } from "vitest";
import { fieldsFromPandoc, htmlToMarkdown, markdownToHtml, mathFromPandoc, stripFootnoteBackrefs } from "./markdown";

describe("markdownToHtml", () => {
  it("converte estrutura básica", async () => {
    const html = await markdownToHtml("# Título\n\ntexto **forte** e *itálico*");
    expect(html).toContain("<h1>Título</h1>");
    expect(html).toContain("<strong>forte</strong>");
    expect(html).toContain("<em>itálico</em>");
  });

  it("converte citação pandoc em span data-citation", async () => {
    const html = await markdownToHtml("Como diz [@silva2020].");
    expect(html).toContain('data-citation=""');
    expect(html).toContain('data-keys="silva2020"');
  });

  it("lê locator e prefixo da citação", async () => {
    const html = await markdownToHtml("[ver @silva2020, p. 45]");
    expect(html).toContain('data-keys="silva2020"');
    expect(html).toContain('data-locator="45"');
    expect(html).toContain('data-prefix="ver"');
  });

  it("não trata links markdown como citação", async () => {
    const html = await markdownToHtml("[texto @estranho](https://x.com)");
    expect(html).not.toContain("data-citation");
    expect(html).toContain("<a");
  });

  it("converte $latex$ em span data-math", async () => {
    const html = await markdownToHtml("a fórmula $E=mc^2$ muda tudo");
    expect(html).toContain('data-math=""');
    expect(html).toContain('data-latex="E=mc^2"');
  });

  it("escapa HTML dentro do LaTeX", async () => {
    const html = await markdownToHtml("$a<b$");
    expect(html).toContain('data-latex="a&lt;b"');
    expect(html).not.toContain("<b$");
  });

  it("não trata cifrão de moeda como math", async () => {
    const html = await markdownToHtml("custa $50 e o outro $60, caro");
    expect(html).not.toContain("data-math");
    const html2 = await markdownToHtml("preço: $ 100$");
    expect(html2).not.toContain("data-math");
  });
});

describe("htmlToMarkdown", () => {
  it("faz roundtrip de estrutura básica", async () => {
    const md = "# Título\n\ntexto **forte**\n";
    const html = await markdownToHtml(md);
    expect(htmlToMarkdown(html)).toBe(md);
  });

  it("serializa citação de volta para sintaxe pandoc com espaços preservados", () => {
    const html = 'texto <span data-citation="" data-keys="silva2020"></span> e mais';
    expect(htmlToMarkdown(html)).toBe("texto [@silva2020] e mais\n");
  });

  it("serializa notas de rodapé em sintaxe [^n]", () => {
    const html =
      '<p>corpo<sup data-fn-ref="abc"></sup></p>' +
      '<section data-footnotes=""><div data-footnote="abc"><p>a nota</p></div></section>';
    const md = htmlToMarkdown(html);
    expect(md).toContain("corpo[^1]");
    expect(md).toContain("[^1]: a nota");
  });

  it("mantém legendas como HTML cru (com marcas inline)", () => {
    const html = '<p data-caption="figure">um <em>gato</em></p>';
    expect(htmlToMarkdown(html)).toContain('<p data-caption="figure">um <em>gato</em></p>');
  });

  it("faz roundtrip de legenda e lista de figuras via markdown", async () => {
    const md = '<p data-caption="figure">um gato</p>\n\n<nav data-toc="figures"></nav>\n';
    const html = await markdownToHtml(md);
    expect(html).toContain('data-caption="figure"');
    expect(html).toContain('data-toc="figures"');
    const back = htmlToMarkdown(html);
    expect(back).toContain('<p data-caption="figure">um gato</p>');
    expect(back).toContain('<nav data-toc="figures"></nav>');
  });

  it("faz roundtrip de refId de título via {#id} e de span de referência", async () => {
    const html =
      '<h2 data-ref-id="ref-abc">Métodos</h2><p>ver <span data-crossref="ref-abc"></span> adiante</p>';
    const md = htmlToMarkdown(html);
    expect(md).toContain("## Métodos {#ref-abc}");
    expect(md).toContain('<span data-crossref="ref-abc"></span>');
    const back = await markdownToHtml(md);
    expect(back).toContain('data-ref-id="ref-abc"');
    expect(back).not.toContain("{#ref-abc}");
    expect(back).toContain('data-crossref="ref-abc"');
  });

  it("título sem refId não ganha sufixo {#}", () => {
    expect(htmlToMarkdown("<h1>Simples</h1>")).toBe("# Simples\n");
  });

  it("legenda preserva data-ref-id no roundtrip", () => {
    const html = '<p data-caption="table" data-ref-id="ref-t1">medições</p>';
    expect(htmlToMarkdown(html)).toContain('<p data-caption="table" data-ref-id="ref-t1">medições</p>');
  });

  it("faz roundtrip de equação inline", async () => {
    const md = "a fórmula $E=mc^2$ muda tudo\n";
    const html = await markdownToHtml(md);
    expect(htmlToMarkdown(html)).toBe(md);
  });

  it("degrada revisão: deleção vira strikethrough, comentário mantém texto", () => {
    const html =
      '<p><span data-comment-id="c1">comentado</span> <span data-deletion="">apagado</span></p>';
    const md = htmlToMarkdown(html);
    expect(md).toContain("comentado");
    expect(md).toContain("~~apagado~~");
  });
});

describe("mathFromPandoc", () => {
  it("converte spans math do pandoc (--mathjax) para data-math", () => {
    const html = '<p>veja <span class="math inline">\\(E=mc^2\\)</span> aqui</p>';
    const out = mathFromPandoc(html);
    expect(out).toContain('data-math=""');
    expect(out).toContain('data-latex="E=mc^2"');
    expect(out).not.toContain("math inline");
  });

  it("math display vira nó inline (sem os \\[ \\])", () => {
    const html = '<span class="math display">\\[\\sum_{i=1}^n i\\]</span>';
    const out = mathFromPandoc(html);
    expect(out).toContain("data-latex=");
    expect(out).not.toContain("\\[");
  });

  it("não toca HTML sem math", () => {
    const html = "<p>nada de especial</p>";
    expect(mathFromPandoc(html)).toBe(html);
  });
});

describe("stripFootnoteBackrefs", () => {
  it("remove âncoras de retorno do pandoc e do marked-footnote", () => {
    const html =
      '<p>nota<a data-footnote-backref="" href="#x">↩</a>' +
      '<a class="footnote-back" href="#y">↩</a>' +
      '<a role="doc-backlink" href="#z">↩</a></p>';
    expect(stripFootnoteBackrefs(html)).toBe("<p>nota</p>");
  });
});

describe("fieldsFromPandoc (import de docx acadêmico)", () => {
  it("legenda com bookmark vira caption node com data-ref-id, sem o número congelado", () => {
    const html = '<p><span id="_Ref_fig1" class="anchor"></span>Figura 1 — Diagrama do metodo</p>';
    const out = fieldsFromPandoc(html);
    expect(out).toContain('data-caption="figure"');
    expect(out).toContain('data-ref-id="_Ref_fig1"');
    expect(out).toContain("Diagrama do metodo");
    expect(out).not.toContain("Figura 1"); // número recomputado ao vivo
  });

  it("legenda de tabela sem bookmark (formato com travessão) também converte — round-trip do nosso export", () => {
    const html = "<p>Tabela 12 – Resultados por grupo</p>";
    const out = fieldsFromPandoc(html);
    expect(out).toContain('data-caption="table"');
    expect(out).toContain("Resultados por grupo");
  });

  it("parágrafo 'Figura' sem travessão nem bookmark NÃO vira legenda", () => {
    const html = "<p>Figura 1 aparece na capa do argumento e a tese segue.</p>";
    const out = fieldsFromPandoc(html);
    expect(out).not.toContain("data-caption");
    expect(out).toContain("Figura 1 aparece na capa");
  });

  it("título-alvo de REF ganha data-ref-id; link interno vira crossref", () => {
    const html =
      '<h2><span id="_Ref_sec" class="anchor"></span>Metodologia</h2>' +
      '<p>Ver <a href="#_Ref_sec">Seção 2</a>.</p>';
    const out = fieldsFromPandoc(html);
    expect(out).toContain('<h2 data-ref-id="_Ref_sec">Metodologia</h2>');
    expect(out).toContain('data-crossref="_Ref_sec"');
    expect(out).not.toContain("<a href=");
  });

  it("links de nota de rodapé e externos ficam intocados", () => {
    const html =
      '<p><span id="_Ref_x" class="anchor"></span>Figura 1 — L</p>' +
      '<p>ver nota<a href="#fn1" class="footnote-ref"><sup>1</sup></a> e <a href="https://x.com">site</a></p>';
    const out = fieldsFromPandoc(html);
    expect(out).toContain('href="#fn1"');
    expect(out).toContain('href="https://x.com"');
  });

  it("HTML real do pandoc (auditoria 13.1) recupera legendas e as duas crossrefs", () => {
    const html =
      '<p><span id="_Ref_fig1" class="anchor"></span>Figura 1 — Diagrama do metodo proposto</p>' +
      "<table><tbody><tr><td>A</td></tr></tbody></table>" +
      '<p><span id="_Ref_tab1" class="anchor"></span>Tabela 1 — Resultados por grupo</p>' +
      '<p>Ver a <a href="#_Ref_fig1">Figura 1</a> e a <a href="#_Ref_tab1">Tabela 1</a> para detalhes.</p>';
    const out = fieldsFromPandoc(html);
    expect(out).toContain('data-caption="figure"');
    expect(out).toContain('data-caption="table"');
    expect((out.match(/data-crossref=/g) ?? []).length).toBe(2);
    expect(out).toContain("Ver a <span");
  });

  it("HTML sem anchors nem rótulos de legenda passa reto (early-bail)", () => {
    const html = "<p>texto comum, sem legendas nem bookmarks</p>";
    expect(fieldsFromPandoc(html)).toBe(html);
  });
});
