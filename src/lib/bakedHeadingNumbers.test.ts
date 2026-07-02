import { describe, expect, it } from "vitest";
import { bakeHeadingNumbers, stripBakedHeadingNumbers } from "./bakedHeadingNumbers";

describe("bakeHeadingNumbers", () => {
  it("prependa spans marcados com a numeração do contador", () => {
    const out = bakeHeadingNumbers("<h1>Um</h1><h2>Um-Um</h2><h1>Dois</h1>");
    const doc = new DOMParser().parseFromString(out, "text/html");
    const texts = Array.from(doc.querySelectorAll("h1, h2")).map((el) => el.textContent);
    expect(texts).toEqual(["1 Um", "1.1 Um-Um", "2 Dois"]);
    expect(doc.querySelectorAll("span[data-baked-heading-num]").length).toBe(3);
  });

  it("ignora títulos de notas de rodapé e bibliografia", () => {
    const out = bakeHeadingNumbers(
      '<h1>Um</h1><section data-footnotes=""><h2>Notas</h2></section>' +
        '<section class="bibliography"><h2>Referências</h2></section>'
    );
    const doc = new DOMParser().parseFromString(out, "text/html");
    expect(doc.querySelectorAll("span[data-baked-heading-num]").length).toBe(1);
    expect(doc.querySelector("section h2")?.textContent).toBe("Notas");
  });

  it("roundtrip com strip devolve o HTML original", () => {
    const html = "<h1>Um</h1><h2>Um-Um</h2>";
    expect(stripBakedHeadingNumbers(bakeHeadingNumbers(html))).toBe(html);
  });
});

describe("stripBakedHeadingNumbers — marcadores", () => {
  it("remove spans marcados mesmo com heurística desligada", () => {
    const html = '<h1><span data-baked-heading-num="">1 </span>Um</h1>';
    expect(stripBakedHeadingNumbers(html, false)).toBe("<h1>Um</h1>");
  });

  it("remove cópias da decoração do editor (span.heading-num)", () => {
    const html = '<h1><span class="heading-num">1 </span>Um</h1>';
    expect(stripBakedHeadingNumbers(html, false)).toBe("<h1>Um</h1>");
  });
});

describe("stripBakedHeadingNumbers — heurística (stripUnmarked)", () => {
  it("remove prefixos quando a sequência inteira bate com o contador", () => {
    const html = "<h1>1 Um</h1><h2>1.1 Um-Um</h2><h1>2 Dois</h1>";
    expect(stripBakedHeadingNumbers(html, true)).toBe("<h1>Um</h1><h2>Um-Um</h2><h1>Dois</h1>");
  });

  it("não toca em nada com heurística desligada", () => {
    const html = "<h1>1 Um</h1><h2>1.1 Um-Um</h2>";
    expect(stripBakedHeadingNumbers(html, false)).toBe(html);
  });

  it("número com ponto é conteúdo legítimo, nunca removido", () => {
    const html = "<h1>2001. Uma Odisseia</h1>";
    expect(stripBakedHeadingNumbers(html, true)).toBe(html);
  });

  it("um único título fora da sequência preserva todos", () => {
    const html = "<h1>1 Um</h1><h2>7.3 Fora da sequência</h2>";
    expect(stripBakedHeadingNumbers(html, true)).toBe(html);
  });

  it("sequência parcial (nem todos com prefixo) preserva todos", () => {
    const html = "<h1>1 Um</h1><h1>Dois sem número</h1>";
    expect(stripBakedHeadingNumbers(html, true)).toBe(html);
  });

  it("títulos de notas/bibliografia não entram na validação da sequência", () => {
    const html =
      "<h1>1 Um</h1>" +
      '<section data-footnotes=""><h2>Notas</h2></section>';
    expect(stripBakedHeadingNumbers(html, true)).toBe(
      "<h1>Um</h1>" + '<section data-footnotes=""><h2>Notas</h2></section>'
    );
  });

  it("prefixo dentro de elemento inline também é removido", () => {
    const html = "<h1><strong>1 Um</strong></h1>";
    expect(stripBakedHeadingNumbers(html, true)).toBe("<h1><strong>Um</strong></h1>");
  });
});
