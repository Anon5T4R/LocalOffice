import { describe, expect, it } from "vitest";
import { newId } from "./id";

describe("newId", () => {
  it("aplica o prefixo e o formato", () => {
    expect(newId("fn-")).toMatch(/^fn-[0-9a-f]{12}$/);
    expect(newId()).toMatch(/^[0-9a-f]{12}$/);
  });

  it("gera 1000 ids sem colisão", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newId("c-")));
    expect(ids.size).toBe(1000);
  });
});
