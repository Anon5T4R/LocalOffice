import { invoke } from "@tauri-apps/api/core";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import { markdownToHtml, htmlToMarkdown, fieldsFromPandoc, mathFromPandoc, stripFootnoteBackrefs } from "./markdown";
import { bakeCitationsHtml } from "./citationStore";
import { bakeHeadingNumbers, detectManualNumberingSequence, stripBakedHeadingNumbers } from "./bakedHeadingNumbers";
import { bakeCaptionNumbers } from "./captionNumbers";
import { bakeNativeFieldsForDocx } from "./docxFields";
import { prepareForPandoc } from "./exportPrep";
import { bakeReviewForDocx, reviewFromPandoc } from "./reviewExport";
import { loadSettings } from "./settings";
import { settingsLayout, type DocLayout } from "../editor/DocLayout";
import { t } from "./i18n";

/** Whether the editor HTML carries footnotes (drives the DOCX/ODT export path). */
function hasFootnotes(html: string): boolean {
  return html.includes("data-fn-ref") || html.includes("data-footnotes");
}

/** Whether the editor HTML carries equations (also drives the export path). */
function hasMath(html: string): boolean {
  return html.includes("data-math");
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
  /** Layout embedded in the file (see extractLayout below), or null if the
   *  document never had one of its own — the editor falls back to Settings. */
  layout: DocLayout | null;
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

// Per-document layout (see editor/DocLayout.ts) travels with .md/.html files
// as a leading HTML comment — invisible to any other reader/renderer of the
// file, and trivial to strip back out. Pandoc formats (docx/odt/rtf) don't
// round-trip it: pandoc's HTML reader/writer drops arbitrary comments and
// data-* metadata, so those seed from Settings on every open, same as before
// this feature existed.
const LAYOUT_MARKER_RE = /^<!--localoffice:layout (.*?)-->\n?/;

function extractLayout(raw: string): { raw: string; layout: DocLayout | null } {
  const m = raw.match(LAYOUT_MARKER_RE);
  if (!m) return { raw, layout: null };
  try {
    return { raw: raw.slice(m[0].length), layout: JSON.parse(m[1]) as DocLayout };
  } catch {
    return { raw, layout: null }; // malformed marker — treat as ordinary content, don't lose it
  }
}

function embedLayout(raw: string, layout: DocLayout | null): string {
  return layout ? `<!--localoffice:layout ${JSON.stringify(layout)}-->\n${raw}` : raw;
}

/**
 * Marked heading-number spans are always stripped silently — deterministic,
 * never real content. A plain-text prefix sequence that exactly matches what
 * the automatic counter would generate is ambiguous, though: it's either a
 * number this app baked and lost the marker for (DOCX/ODT round-trip drops
 * the span), or a document someone numbered by hand in the same convention
 * (common with ABNT's "1 Introdução" style) — silently deleting somebody
 * else's typed numbers is not a safe default, so this asks first.
 */
function resolveHeadingNumbers(
  html: string,
  stripUnmarked: boolean,
  layout: DocLayout | null
): { html: string; layout: DocLayout | null } {
  if (stripUnmarked && detectManualNumberingSequence(html)) {
    const convert = window.confirm(t("file.confirmHeadingNumbers"));
    if (convert) return { html: stripBakedHeadingNumbers(html, true), layout };
    // Keep the typed numbers as real content: turn automatic numbering off
    // for THIS document only — the app-wide setting is untouched, so other
    // documents keep numbering as before.
    return {
      html: stripBakedHeadingNumbers(html, false),
      layout: { ...(layout ?? settingsLayout(loadSettings())), numberHeadings: false },
    };
  }
  return { html: stripBakedHeadingNumbers(html, stripUnmarked), layout };
}

/** Load a file's contents into editor HTML. */
async function readToHtml(path: string, format: DocFormat): Promise<{ html: string; layout: DocLayout | null }> {
  if (PANDOC_FORMATS.has(format)) {
    const html = await invoke<string>("import_via_pandoc", { path, from: format });
    // No embedded layout for pandoc formats — fall back to Settings, same as
    // the numberHeadings-driven strip did before layout became per-document.
    const stripUnmarked = loadSettings().numberHeadings === true;
    return resolveHeadingNumbers(
      fieldsFromPandoc(mathFromPandoc(reviewFromPandoc(stripFootnoteBackrefs(html)))),
      stripUnmarked,
      null
    );
  }
  const rawFile = await invoke<string>("read_text_file", { path });
  const { raw, layout } = extractLayout(rawFile);
  const html = format === "markdown" ? await markdownToHtml(raw) : raw;
  // Heading numbers baked into the file by an export must come back out, or
  // the editor's decorations double them. Unmarked text prefixes (DOCX loses
  // the marker span) are only stripped while automatic numbering is on — with
  // it off there is nothing to double, so the text is left alone.
  const stripUnmarked = layout ? layout.numberHeadings : loadSettings().numberHeadings === true;
  return resolveHeadingNumbers(html, stripUnmarked, layout);
}

/** Write editor HTML to disk in the given format. */
export async function saveDocumentTo(
  path: string,
  html: string,
  format: DocFormat,
  layout: DocLayout | null
): Promise<void> {
  const numberHeadings = layout ? layout.numberHeadings : loadSettings().numberHeadings === true;
  // Automatic heading numbers are editor decorations and don't serialize —
  // bake them in (marked, so reopening strips them) or a Word/browser reader
  // sees unnumbered headings. Markdown stays clean: it's source form, and the
  // editor regenerates the numbers from it.
  if (format !== "markdown" && numberHeadings) {
    html = bakeHeadingNumbers(html);
  }
  // Caption numbers are also decorations; bake them the same way. Markdown
  // stays clean here too — the editor regenerates the numbers from the doc.
  // DOCX gets native SEQ/REF fields instead (below, bakeNativeFieldsForDocx)
  // so Word recalculates them itself; ODT/RTF keep the plain-text bake below
  // — {=openxml} raw blocks are docx-specific, ODF fields are a different,
  // unvalidated mechanism (text:sequence/text:reference-mark) left for a
  // future PR.
  const useNativeFields = format === "docx";
  if (format !== "markdown" && !useNativeFields) {
    html = bakeCaptionNumbers(html);
  }
  if (PANDOC_FORMATS.has(format)) {
    // Word/ODT are one-way outputs for citations: bake them as formatted text
    // (a Word user without Zotero still reads the document correctly).
    // Comments and tracked changes become native Word review data.
    // prepareForPandoc then rewrites what only the app understands: page
    // breaks (docx: raw OOXML marker; odt/rtf: dropped), TOC navs (baked
    // entry list) and empty paragraphs (NBSP, or pandoc drops the line).
    const baked = prepareForPandoc(bakeReviewForDocx(bakeCitationsHtml(html)), format);
    const hasCaptionsOrRefs = baked.includes("data-caption") || baked.includes("data-crossref");
    // pandoc's HTML reader can't turn our footnote markup into native notes,
    // math spans into equations, or (docx only) captions/crossrefs/page
    // breaks into native Word constructs — for docs with any of those we go
    // through Markdown ([^n] / $latex$ / raw OOXML), which pandoc maps to
    // real Word/ODT constructs. Plain docs stay on the higher-fidelity HTML
    // path.
    const hasOoxmlMarkers = baked.includes("data-ooxml");
    if (hasFootnotes(baked) || hasMath(baked) || (useNativeFields && (hasCaptionsOrRefs || hasOoxmlMarkers))) {
      const forExport = useNativeFields ? bakeNativeFieldsForDocx(baked) : baked;
      await invoke("export_via_pandoc", { path, content: htmlToMarkdown(forExport), from: "markdown", to: format });
    } else {
      await invoke("export_via_pandoc", { path, content: baked, from: "html", to: format });
    }
    return;
  }
  // .md keeps pandoc [@key] syntax; .html keeps the data attributes (both round-trip).
  const contents = embedLayout(format === "markdown" ? htmlToMarkdown(html) : html, layout);
  await invoke("write_text_file", { path, contents });
}

/** Load a document from a known path (used by the recents menu). */
export async function openDocumentPath(path: string): Promise<DocFile> {
  const format = formatFromPath(path);
  const { html, layout } = await readToHtml(path, format);
  return { path, html, format, layout };
}

/** Show a native open dialog and load the chosen file. Returns null if cancelled. */
export async function openDocument(): Promise<DocFile | null> {
  const selected = await openDialog({
    multiple: false,
    filters: [
      {
        name: t("file.filterDocuments"),
        extensions: ["md", "markdown", "txt", "docx", "odt", "rtf", "html", "htm"],
      },
      { name: t("file.filterAll"), extensions: ["*"] },
    ],
  });
  if (!selected || Array.isArray(selected)) return null;
  const format = formatFromPath(selected);
  const { html, layout } = await readToHtml(selected, format);
  return { path: selected, html, format, layout };
}

/** Show a native save dialog and write there. Returns the new DocFile, or null if cancelled. */
export async function saveDocumentAs(
  html: string,
  layout: DocLayout | null,
  suggestedName = t("file.untitledName")
): Promise<DocFile | null> {
  const path = await saveDialog({
    defaultPath: suggestedName,
    filters: [
      { name: t("file.filterMarkdown"), extensions: ["md"] },
      { name: t("file.filterDocx"), extensions: ["docx"] },
      { name: t("file.filterOdt"), extensions: ["odt"] },
      { name: t("file.filterRtf"), extensions: ["rtf"] },
      { name: t("file.filterHtml"), extensions: ["html"] },
      { name: t("file.filterText"), extensions: ["txt"] },
    ],
  });
  if (!path) return null;
  const format = formatFromPath(path);
  await saveDocumentTo(path, html, format, layout);
  return { path, html, format, layout };
}
