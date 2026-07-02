import { describe, expect, it } from "vitest";
import { arrayOfObjectsEqual, shallowEqual } from "./equality";

describe("shallowEqual", () => {
  it("compara primitivos e referências", () => {
    expect(shallowEqual(1, 1)).toBe(true);
    expect(shallowEqual("a", "b")).toBe(false);
    expect(shallowEqual(NaN, NaN)).toBe(true);
  });

  it("compara objetos planos por valor", () => {
    expect(shallowEqual({ a: 1, b: "x" }, { a: 1, b: "x" })).toBe(true);
    expect(shallowEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(shallowEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });

  it("objetos aninhados só são iguais por referência", () => {
    const nested = { x: 1 };
    expect(shallowEqual({ a: nested }, { a: nested })).toBe(true);
    expect(shallowEqual({ a: { x: 1 } }, { a: { x: 1 } })).toBe(false);
  });
});

describe("arrayOfObjectsEqual", () => {
  it("compara listas de objetos planos item a item", () => {
    const a = [{ level: 1, text: "Um", pos: 0 }, { level: 2, text: "Dois", pos: 10 }];
    const b = [{ level: 1, text: "Um", pos: 0 }, { level: 2, text: "Dois", pos: 10 }];
    expect(arrayOfObjectsEqual(a, b)).toBe(true);
    expect(arrayOfObjectsEqual(a, b.slice(0, 1))).toBe(false);
    expect(arrayOfObjectsEqual(a, [b[0], { ...b[1], pos: 11 }])).toBe(false);
  });

  it("tolera b nulo (primeira comparação do useEditorState)", () => {
    expect(arrayOfObjectsEqual([], null)).toBe(false);
    expect(arrayOfObjectsEqual([], undefined)).toBe(false);
  });
});
