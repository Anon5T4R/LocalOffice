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

  it("M2: unidades de linha do mesmo parágrafo quebram no meio (offset intra-parágrafo)", () => {
    // measureUnits emite uma unidade por linha; a 1ª linha quebra no início
    // do bloco (offset 10) e as demais nas posições internas do parágrafo
    // (11, 12, ...). computeBreakPoints não distingue bloco de linha -- só
    // acumula altura e quebra antes da unidade que estoura.
    const lineUnits = [
      { offset: 10, height: 400, isManualBreak: false }, // linha 1 (início do parágrafo)
      { offset: 11, height: 400, isManualBreak: false }, // linha 2 (dentro do parágrafo)
      { offset: 12, height: 400, isManualBreak: false }, // linha 3 (dentro do parágrafo)
    ];
    const points = computeBreakPoints(lineUnits, 1000);
    // 400+400 cabe; +400 estoura -> quebra antes da linha 3, num offset que
    // é interno ao parágrafo (12), não um limite de bloco.
    expect(points).toEqual([{ offset: 12, pageNumber: 2 }]);
  });
});
