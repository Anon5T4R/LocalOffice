import { describe, expect, it } from "vitest";
import { htmlToMarkdown, markdownToHtml, stripFootnoteBackrefs } from "./markdown";

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

  it("degrada revisão: deleção vira strikethrough, comentário mantém texto", () => {
    const html =
      '<p><span data-comment-id="c1">comentado</span> <span data-deletion="">apagado</span></p>';
    const md = htmlToMarkdown(html);
    expect(md).toContain("comentado");
    expect(md).toContain("~~apagado~~");
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
