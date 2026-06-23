import { invoke } from "@tauri-apps/api/core";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { markdownToHtml, htmlToMarkdown } from "./markdown";

// Formats the app can round-trip. markdown/html in pure JS; docx/odt via the
// pandoc sidecar (semantic/pragmatic fidelity).
export type DocFormat = "markdown" | "html" | "docx" | "odt";

export interface DocFile {
  path: string;
  html: string;
  format: DocFormat;
}

function formatFromPath(path: string): DocFormat {
  const ext = path.split(/[\\/]/).pop()?.split(".").pop()?.toLowerCase();
  if (ext === "docx") return "docx";
  if (ext === "odt") return "odt";
  if (ext === "html" || ext === "htm") return "html";
  // .md, .markdown, .txt and anything else -> Markdown/plain text
  return "markdown";
}

export function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/** Load a file's contents into editor HTML. */
async function readToHtml(path: string, format: DocFormat): Promise<string> {
  if (format === "docx" || format === "odt") {
    return invoke<string>("import_via_pandoc", { path, from: format });
  }
  const raw = await invoke<string>("read_text_file", { path });
  return format === "markdown" ? markdownToHtml(raw) : raw;
}

/** Write editor HTML to disk in the given format. */
export async function saveDocumentTo(path: string, html: string, format: DocFormat): Promise<void> {
  if (format === "docx" || format === "odt") {
    await invoke("export_via_pandoc", { path, html, to: format });
    return;
  }
  const contents = format === "markdown" ? htmlToMarkdown(html) : html;
  await invoke("write_text_file", { path, contents });
}

/** Load a document from a known path (used by the recents menu). */
export async function openDocumentPath(path: string): Promise<DocFile> {
  const format = formatFromPath(path);
  const html = await readToHtml(path, format);
  return { path, html, format };
}

/** Show a native open dialog and load the chosen file. Returns null if cancelled. */
export async function openDocument(): Promise<DocFile | null> {
  const selected = await openDialog({
    multiple: false,
    filters: [
      {
        name: "Documentos",
        extensions: ["md", "markdown", "txt", "docx", "odt", "html", "htm"],
      },
      { name: "Todos os arquivos", extensions: ["*"] },
    ],
  });
  if (!selected || Array.isArray(selected)) return null;
  const format = formatFromPath(selected);
  const html = await readToHtml(selected, format);
  return { path: selected, html, format };
}

/** Show a native save dialog and write there. Returns the new DocFile, or null if cancelled. */
export async function saveDocumentAs(html: string, suggestedName = "sem-titulo.md"): Promise<DocFile | null> {
  const path = await saveDialog({
    defaultPath: suggestedName,
    filters: [
      { name: "Markdown", extensions: ["md"] },
      { name: "Word (DOCX)", extensions: ["docx"] },
      { name: "OpenDocument (ODT)", extensions: ["odt"] },
      { name: "HTML", extensions: ["html"] },
      { name: "Texto", extensions: ["txt"] },
    ],
  });
  if (!path) return null;
  const format = formatFromPath(path);
  await saveDocumentTo(path, html, format);
  return { path, html, format };
}
