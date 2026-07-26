import { describe, expect, it, vi } from "vitest";

import { dirOf, inlineRelativeImages, isExternalSrc, joinPath, mimeOf } from "./localImages";

const lerOk = (b64 = "QUJD") => vi.fn(async () => b64);

describe("isExternalSrc", () => {
  it("deixa em paz o que já está resolvido ou é remoto", () => {
    for (const s of [
      "data:image/png;base64,AAA",
      "blob:x",
      "https://x/y.png",
      "http://x/y.png",
      "file:///tmp/a.png",
      "/abs/a.png",
      "C:\\fotos\\a.png",
    ]) {
      expect(isExternalSrc(s)).toBe(true);
    }
  });

  it("trata como local o que é relativo", () => {
    expect(isExternalSrc("_attachments/a.jpg")).toBe(false);
    expect(isExternalSrc("./img/a.jpg")).toBe(false);
    expect(isExternalSrc("a.jpg")).toBe(false);
  });
});

describe("joinPath / dirOf", () => {
  it("usa o separador que a pasta já usa", () => {
    expect(joinPath("/home/u/notas", "_attachments/a.jpg")).toBe("/home/u/notas/_attachments/a.jpg");
    expect(joinPath("C:\\notas", "img\\a.jpg")).toBe("C:\\notas\\img\\a.jpg");
  });

  it("extrai a pasta nos dois formatos", () => {
    expect(dirOf("/home/u/notas/1.md")).toBe("/home/u/notas");
    expect(dirOf("C:\\notas\\1.md")).toBe("C:\\notas");
    expect(dirOf("1.md")).toBe("");
  });
});

describe("mimeOf", () => {
  it("acerta pela extensão e cai em png quando não conhece", () => {
    expect(mimeOf("/a/b.JPG")).toBe("image/jpeg");
    expect(mimeOf("/a/b.webp")).toBe("image/webp");
    expect(mimeOf("/a/b.desconhecido")).toBe("image/png");
  });
});

describe("inlineRelativeImages", () => {
  it("resolve o caso real: nota do OpenObsidian com _attachments", async () => {
    const html = '<p><img src="_attachments/1785082883074.jpg" alt="foto"></p>';
    const out = await inlineRelativeImages(html, "/home/u/Downloads", lerOk());
    expect(out).toContain("data:image/jpeg;base64,QUJD");
    expect(out).not.toContain("_attachments/");
    expect(out).toContain('alt="foto"'); // não pode comer os outros atributos
  });

  it("passa o caminho ABSOLUTO pro leitor", async () => {
    const ler = lerOk();
    await inlineRelativeImages('<img src="_attachments/a.jpg">', "/home/u/Downloads", ler);
    expect(ler).toHaveBeenCalledWith("/home/u/Downloads/_attachments/a.jpg");
  });

  it("não toca no que já é data:, http: ou absoluto", async () => {
    const ler = lerOk();
    const html =
      '<img src="data:image/png;base64,AAA"><img src="https://x/y.png"><img src="/abs/z.png">';
    expect(await inlineRelativeImages(html, "/base", ler)).toBe(html);
    expect(ler).not.toHaveBeenCalled();
  });

  it("lê UMA vez por arquivo, mesmo repetido no documento", async () => {
    const ler = lerOk();
    await inlineRelativeImages('<img src="a.jpg"><img src="a.jpg"><img src="a.jpg">', "/b", ler);
    expect(ler).toHaveBeenCalledTimes(1);
  });

  it("imagem que falha ao ler fica como está — não some", async () => {
    // Sumir seria pior: o documento pareceria íntegro e o usuário não teria
    // como saber qual arquivo procurar.
    const ler = vi.fn(async () => {
      throw new Error("sem permissão");
    });
    const html = '<img src="sumiu.jpg">';
    expect(await inlineRelativeImages(html, "/b", ler)).toBe(html);
  });

  it("uma falha não impede as outras de entrarem", async () => {
    const ler = vi.fn(async (abs: string) => {
      if (abs.endsWith("ruim.jpg")) throw new Error("x");
      return "QUJD";
    });
    const out = await inlineRelativeImages('<img src="ruim.jpg"><img src="boa.png">', "/b", ler);
    expect(out).toContain("ruim.jpg");
    expect(out).toContain("data:image/png;base64,QUJD");
  });

  it("aceita aspas simples e src com espaço codificado", async () => {
    const ler = lerOk();
    await inlineRelativeImages("<img src='img/foto%20final.png'>", "/b", ler);
    expect(ler).toHaveBeenCalledWith("/b/img/foto final.png");
  });

  it("sem baseDir ou sem <img>, devolve o mesmo html sem ler nada", async () => {
    const ler = lerOk();
    expect(await inlineRelativeImages('<img src="a.jpg">', "", ler)).toBe('<img src="a.jpg">');
    expect(await inlineRelativeImages("<p>sem imagem</p>", "/b", ler)).toBe("<p>sem imagem</p>");
    expect(ler).not.toHaveBeenCalled();
  });
});
