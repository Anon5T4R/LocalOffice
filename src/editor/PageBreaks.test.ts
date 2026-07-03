import { describe, expect, it } from "vitest";
import { computeBreakPoints, type MeasuredBlock } from "./PageBreaks";

function block(height: number, isManualBreak = false): MeasuredBlock {
  return { offset: 0, height, isManualBreak };
}

describe("computeBreakPoints", () => {
  it("sem quebra quando tudo cabe numa página", () => {
    const blocks = [block(100), block(100), block(100)];
    expect(computeBreakPoints(blocks, 1000)).toEqual([]);
  });

  it("quebra quando o próximo bloco estoura a página", () => {
    const blocks = [
      { offset: 0, height: 400, isManualBreak: false },
      { offset: 10, height: 400, isManualBreak: false },
      { offset: 20, height: 400, isManualBreak: false },
    ];
    const points = computeBreakPoints(blocks, 1000);
    // 400 + 400 = 800 (cabe); + 400 = 1200 (estoura) -> quebra antes do 3º bloco
    expect(points).toEqual([{ offset: 20, pageNumber: 2 }]);
  });

  it("bloco maior que uma página inteira ainda ganha a própria página, sem loop", () => {
    const blocks = [
      { offset: 0, height: 100, isManualBreak: false },
      { offset: 10, height: 5000, isManualBreak: false }, // maior que "printable"
      { offset: 20, height: 100, isManualBreak: false },
    ];
    const points = computeBreakPoints(blocks, 1000);
    // quebra antes do bloco gigante (não cabe com o anterior) e de novo
    // antes do bloco seguinte (o gigante sozinho já estourou "used").
    expect(points).toEqual([
      { offset: 10, pageNumber: 2 },
      { offset: 20, pageNumber: 3 },
    ]);
  });

  it("quebra manual força a próxima página mesmo com espaço sobrando", () => {
    const blocks = [
      { offset: 0, height: 50, isManualBreak: false },
      { offset: 10, height: 50, isManualBreak: true }, // o pageBreak node em si
      { offset: 20, height: 50, isManualBreak: false },
    ];
    const points = computeBreakPoints(blocks, 1000);
    expect(points).toEqual([{ offset: 20, pageNumber: 2 }]);
  });

  it("numera páginas corretamente com múltiplas quebras", () => {
    const blocks = [
      { offset: 0, height: 600, isManualBreak: false },
      { offset: 10, height: 600, isManualBreak: false }, // pág 2
      { offset: 20, height: 600, isManualBreak: false }, // pág 3
    ];
    const points = computeBreakPoints(blocks, 1000);
    expect(points.map((p) => p.pageNumber)).toEqual([2, 3]);
  });

  it("lista vazia não quebra", () => {
    expect(computeBreakPoints([], 1000)).toEqual([]);
  });

  it("M2: um parágrafo que estoura é dividido entre linhas via splitLines (offset intra-parágrafo)", () => {
    // O bloco (altura 1200 > printable 1000) só expande em linhas porque
    // straddles; posOfLine só é chamado para a linha que vira quebra.
    const posCalls: number[] = [];
    const block = {
      offset: 10,
      height: 1200,
      isManualBreak: false,
      splitLines: () => ({
        lineHeights: [400, 400, 400],
        posOfLine: (i: number) => {
          posCalls.push(i);
          return [10, 11, 12][i];
        },
      }),
    };
    const points = computeBreakPoints([block], 1000);
    // Guloso quebraria antes da 3ª linha (i=2), mas isso deixaria a última
    // linha sozinha na página seguinte — a regra de VIÚVA (2/2) puxa uma
    // linha junto: quebra antes da 2ª (offset 11).
    expect(points).toEqual([{ offset: 11, pageNumber: 2 }]);
    // posOfLine chamado só para a linha da quebra final, não para todas --
    // é o que torna a remedição barata em doc grande.
    expect(posCalls).toEqual([1]);
  });

  it("M2: órfã (1ª linha sozinha no pé da página) empurra o parágrafo inteiro", () => {
    const filler = { offset: 0, height: 600, isManualBreak: false };
    const para = {
      offset: 10,
      height: 1200, // 600+1200 estoura
      isManualBreak: false,
      splitLines: () => ({
        // linha 0 caberia na sobra (600+400=1000), linhas 1..2 não -> quebra
        // gulosa em i=1 deixaria a linha 0 órfã; regra empurra o bloco todo.
        lineHeights: [400, 400, 400],
        posOfLine: (i: number) => [10, 11, 12][i],
      }),
    };
    const points = computeBreakPoints([filler, para], 1000);
    expect(points[0]).toEqual({ offset: 10, pageNumber: 2 }); // limite do bloco
  });

  it("M2: parágrafo no TOPO da página não sofre empurrão de órfã (não há pra onde)", () => {
    const para = {
      offset: 10,
      height: 1200,
      isManualBreak: false,
      splitLines: () => ({
        lineHeights: [900, 200, 200], // 1ª linha quase enche a página sozinha
        posOfLine: (i: number) => [10, 11, 12][i],
      }),
    };
    const points = computeBreakPoints([para], 1000);
    // quebra na 2ª linha mesmo restando só 1 linha na página 1 — o parágrafo
    // já começa a página, empurrar o bloco não resolveria nada.
    expect(points).toEqual([{ offset: 11, pageNumber: 2 }]);
  });

  it("M2: hit-test falhando (posOfLine null) cai para bloco atômico, sem quebra em posição errada", () => {
    const filler = { offset: 0, height: 600, isManualBreak: false };
    const para = {
      offset: 10,
      height: 1600,
      isManualBreak: false,
      splitLines: () => ({
        lineHeights: [400, 400, 400, 400],
        // a 1ª quebra (órfã -> limite do bloco) não precisa de posOfLine; a
        // 2ª (linha 2) precisa e falha -> o bloco inteiro vira atômico.
        posOfLine: (i: number) => (i === 0 ? 10 : null),
      }),
    };
    const points = computeBreakPoints([filler, para], 1000);
    // fallback atômico: uma única quebra, no limite do bloco (offset 10) --
    // nunca uma quebra em posição inventada no meio do parágrafo.
    expect(points).toEqual([{ offset: 10, pageNumber: 2 }]);
  });

  it("M2: parágrafo divisível que cabe na sobra NÃO chama splitLines (custo evitado)", () => {
    let called = false;
    const filler = { offset: 0, height: 900, isManualBreak: false };
    const para = {
      offset: 10,
      height: 50, // cabe na sobra (900+50 <= 1000)
      isManualBreak: false,
      splitLines: () => {
        called = true;
        return { lineHeights: [50], posOfLine: () => 10 };
      },
    };
    computeBreakPoints([filler, para], 1000);
    expect(called).toBe(false);
  });
});
