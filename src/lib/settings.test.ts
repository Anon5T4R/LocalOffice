import { beforeEach, describe, expect, it } from "vitest";
import { addRecent, clearRecents, loadRecents, loadSettings, saveSettings } from "./settings";

beforeEach(() => {
  localStorage.clear();
});

describe("settings", () => {
  it("carrega defaults quando não há nada salvo", () => {
    const s = loadSettings();
    expect(s.theme).toBe("auto");
    expect(s.pageFormat).toBe("classic");
    expect(s.zoom).toBe(100);
  });

  it("carrega defaults quando o storage está corrompido", () => {
    localStorage.setItem("localoffice.settings", "{não é json");
    expect(loadSettings().theme).toBe("auto");
  });

  it("persiste um patch parcial mantendo o resto", () => {
    const next = saveSettings({ zoom: 150 });
    expect(next.zoom).toBe(150);
    expect(next.theme).toBe("auto");
    expect(loadSettings().zoom).toBe(150);
  });
});

describe("recents", () => {
  it("adiciona no topo e deduplica por caminho", () => {
    addRecent("C:\\docs\\a.md");
    addRecent("C:\\docs\\b.md");
    const list = addRecent("C:\\docs\\a.md");
    expect(list.map((r) => r.name)).toEqual(["a.md", "b.md"]);
  });

  it("limita a 10 entradas", () => {
    for (let i = 0; i < 12; i++) addRecent(`C:\\docs\\f${i}.md`);
    expect(loadRecents().length).toBe(10);
  });

  it("clearRecents esvazia a lista", () => {
    addRecent("C:\\docs\\a.md");
    clearRecents();
    expect(loadRecents()).toEqual([]);
  });
});
