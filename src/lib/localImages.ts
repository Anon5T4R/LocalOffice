import { invoke } from "@tauri-apps/api/core";

/**
 * Imagens de caminho RELATIVO num Markdown aberto do disco.
 *
 * Um `![](_attachments/foto.jpg)` vira `<img src="_attachments/foto.jpg">`, e o
 * webview não tem contra o que resolver isso: não há URL base apontando pra
 * pasta do arquivo, e ele não lê caminho arbitrário do disco. Resultado: a nota
 * abre com o ícone de imagem quebrada, sem erro nenhum.
 *
 * A saída é a MESMA que o app já usa pra imagem inserida pelo usuário e pra
 * fonte importada (`read_file_base64` + `data:`), e não por preguiça: o
 * documento do LocalOffice é autossuficiente de propósito — é o que faz uma
 * exportação pra DOCX/PDF levar a imagem junto. Um `asset://` deixaria a
 * imagem viva só enquanto o arquivo estivesse naquele caminho, e exigiria
 * abrir o protocolo de assets e afrouxar a CSP.
 */

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  avif: "image/avif",
  tif: "image/tiff",
  tiff: "image/tiff",
};

/** O `src` aponta pra fora do disco local (já resolvido, ou remoto)? */
export function isExternalSrc(src: string): boolean {
  return (
    src.startsWith("data:") ||
    src.startsWith("blob:") ||
    src.startsWith("http:") ||
    src.startsWith("https:") ||
    src.startsWith("asset:") ||
    src.startsWith("file:") ||
    src.startsWith("/") ||
    /^[a-zA-Z]:[\\/]/.test(src)
  );
}

/** Junta pasta + caminho relativo com o separador que a pasta já usa. */
export function joinPath(dir: string, rel: string): string {
  const sep = dir.includes("\\") && !dir.includes("/") ? "\\" : "/";
  const base = dir.replace(/[\\/]+$/, "");
  return `${base}${sep}${rel.replace(/^[\\/]+/, "")}`;
}

/** Pasta do arquivo, a partir do caminho completo. */
export function dirOf(path: string): string {
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return i < 0 ? "" : path.slice(0, i);
}

export function mimeOf(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return MIME[ext] ?? "image/png";
}

/**
 * Troca todo `src` relativo do HTML por um `data:` URI, resolvendo contra
 * `baseDir`. `ler` recebe o caminho absoluto e devolve o base64.
 *
 * Puro de propósito (o leitor entra por parâmetro): é o que permite testar a
 * resolução de caminho sem tocar em disco nem no Tauri.
 *
 * Uma imagem que falha ao ler é DEIXADA COMO ESTÁ, não removida: o usuário vê
 * o ícone quebrado no lugar certo do texto e sabe qual arquivo procurar — bem
 * melhor que a imagem sumir e o documento parecer íntegro.
 */
export async function inlineRelativeImages(
  html: string,
  baseDir: string,
  ler: (abs: string) => Promise<string>
): Promise<string> {
  if (!baseDir || !html.includes("<img")) return html;

  const srcs = new Set<string>();
  for (const m of html.matchAll(/<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi)) {
    const src = m[1];
    if (!isExternalSrc(src)) srcs.add(src);
  }
  if (srcs.size === 0) return html;

  const mapa = new Map<string, string>();
  await Promise.all(
    [...srcs].map(async (src) => {
      try {
        const abs = joinPath(baseDir, decodeURIComponent(src));
        const b64 = await ler(abs);
        mapa.set(src, `data:${mimeOf(abs)};base64,${b64}`);
      } catch {
        /* deixa como está — ver comentário acima */
      }
    })
  );
  if (mapa.size === 0) return html;

  return html.replace(
    /(<img\b[^>]*?\bsrc\s*=\s*)(["'])([^"']+)\2/gi,
    (todo, antes, aspa, src) => {
      const novo = mapa.get(src);
      return novo ? `${antes}${aspa}${novo}${aspa}` : todo;
    }
  );
}

/** Versão ligada no Tauri, usada pela abertura de documento. */
export function inlineRelativeImagesFromDisk(html: string, docPath: string): Promise<string> {
  return inlineRelativeImages(html, dirOf(docPath), (abs) =>
    invoke<string>("read_file_base64", { path: abs })
  );
}
