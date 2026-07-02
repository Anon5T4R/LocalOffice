import { describe, expect, it } from "vitest";
import { advanceHeadingCounter, newHeadingCounters } from "./HeadingNumbers";

describe("advanceHeadingCounter", () => {
  it("numera uma sequência típica de capítulos e seções", () => {
    const c = newHeadingCounters();
    expect(advanceHeadingCounter(c, 1)).toBe("1");
    expect(advanceHeadingCounter(c, 2)).toBe("1.1");
    expect(advanceHeadingCounter(c, 2)).toBe("1.2");
    expect(advanceHeadingCounter(c, 3)).toBe("1.2.1");
    expect(advanceHeadingCounter(c, 1)).toBe("2");
    expect(advanceHeadingCounter(c, 2)).toBe("2.1");
  });

  it("zera os níveis mais profundos ao subir de nível", () => {
    const c = newHeadingCounters();
    advanceHeadingCounter(c, 1); // 1
    advanceHeadingCounter(c, 3); // 1.0.1
    advanceHeadingCounter(c, 1); // 2
    expect(advanceHeadingCounter(c, 3)).toBe("2.0.1");
  });

  it("começa contando do zero em cada documento", () => {
    expect(advanceHeadingCounter(newHeadingCounters(), 2)).toBe("0.1");
  });
});
