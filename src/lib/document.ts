import { invoke } from "@tauri-apps/api/core";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { markdownToHtml, htmlToMarkdown, stripFootnoteBackrefs } from "./markdown";
import { bakeCitationsHtml } from "./citationStore";
import { bakeReviewForDocx, reviewFromPandoc } from "./reviewExport";

/** Whether the editor HTML carries footnotes (drives the DOCX/ODT export path). */
function hasFootnotes(html: string): boolean {
  return html.includes("data-fn-ref") || html.includes("data-footnotes");
}

// Formats the app can round-trip. markdown/html in pure JS; docx/odt/rtf via
// the pandoc sidecar (semantic/pragmatic fidelity).
export type DocFormat = "markdown" | "html" | "docx" | "odt" | "rtf";

/** Formats that go through the pandoc sidecar. */
const PANDOC_FORMATS: ReadonlySet<DocFormat> = new Set(["docx", "odt", "rtf"]);

export interface DocFile {
  path: string;
  html: string;
  format: DocFormat;
}

function formatFromPath(path: string): DocFormat {
  const ext = path.split(/[\\/]/).pop()?.split(".").pop()?.toLowerCase();
  if (ext === "docx") return "docx";
  if (ext === "odt") return "odt";
  if (ext === "rtf") return "rtf";
  if (ext === "html" || ext === "htm") return "html";
  // .md, .markdown, .txt and anything else -> Markdown/plain text
  return "markdown";
}

export function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/** Load a file's contents into editor HTML. */
async function readToHtml(path: string, format: DocFormat): Promise<string> {
  if (PANDOC_FORMATS.has(format)) {
    const html = await invoke<string>("import_via_pandoc", { path, from: format });
    return reviewFromPandoc(stripFootnoteBackrefs(html));
  }
  const raw = await invoke<string>("read_text_file", { path });
  return format === "markdown" ? await markdownToHtml(raw) : raw;
}

/** Write editor HTML to disk in the given format. */
export async function saveDocumentTo(path: string, html: string, format: DocFormat): Promise<void> {
  if (PANDOC_FORMATS.has(format)) {
    // Word/ODT are one-way outputs for citations: bake them as formatted text
    // (a Word user without Zotero still reads the document correctly).
    // Comments and tracked changes become native Word review data.
    const baked = bakeReviewForDocx(bakeCitationsHtml(html));
    // pandoc's HTML reader can't turn our footnote markup into native notes, so
    // for docs with footnotes we go through Markdown ([^n]) which it maps to real
    // Word/ODT footnotes. Plain docs stay on the higher-fidelity HTML path.
    if (hasFootnotes(baked)) {
      await invoke("export_via_pandoc", { path, content: htmlToMarkdown(baked), from: "markdown", to: format });
    } else {
      await invoke("export_via_pandoc", { path, content: baked, from: "html", to: format });
    }
    return;
  }
  // .md keeps pandoc [@key] syntax; .html keeps the data attributes (both round-trip).
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
        extensions: ["md", "markdown", "txt", "docx", "odt", "rtf", "html", "htm"],
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
      { name: "Rich Text (RTF)", extensions: ["rtf"] },
      { name: "HTML", extensions: ["html"] },
      { name: "Texto", extensions: ["txt"] },
    ],
  });
  if (!path) return null;
  const format = formatFromPath(path);
  await saveDocumentTo(path, html, format);
  return { path, html, format };
}
