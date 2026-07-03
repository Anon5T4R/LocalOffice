import { describe, expect, it } from "vitest";
import { cssSizeToPt, ptToPx, pxToPt } from "./fontUnits";

describe("fontUnits (pt na UI, px por dentro)", () => {
  it("converte os tamanhos de norma exatamente", () => {
    expect(ptToPx(12)).toBe(16); // ABNT/APA corpo
    expect(ptToPx(11)).toBe(14.67); // relatório
    expect(ptToPx(10)).toBe(13.33); // ABNT citação longa/legenda
  });

  it("volta de px para pt sem deriva no ida-e-volta", () => {
    for (const pt of [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 24, 72]) {
      expect(pxToPt(ptToPx(pt))).toBe(pt);
    }
  });

  it("lê tamanhos CSS legados (px) e novos (pt) para exibição", () => {
    expect(cssSizeToPt("16px")).toBe(12);
    expect(cssSizeToPt("12pt")).toBe(12);
    expect(cssSizeToPt("14.67px")).toBe(11);
    expect(cssSizeToPt("")).toBeNull();
    expect(cssSizeToPt(undefined)).toBeNull();
    expect(cssSizeToPt("abc")).toBeNull();
  });
});
