import { marked } from "marked";
import markedFootnote from "marked-footnote";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

// Markdown <-> HTML bridge. The editor works on HTML internally (ProseMirror),
// and we (de)serialize to Markdown only when reading/writing .md/.txt files.

// ---------------------------------------------------------------------------
// Pandoc citations: [@silva2020], [ver @a; -@b, p. 45] <-> citation spans
// ---------------------------------------------------------------------------

/** Serialize a citation span's data attributes into pandoc citation syntax. */
function citationToPandoc(el: HTMLElement): string {
  const keys = (el.getAttribute("data-keys") ?? "").split(",").filter(Boolean);
  if (!keys.length) return "";
  const prefix = el.getAttribute("data-prefix") ?? "";
  const locator = el.getAttribute("data-locator") ?? "";
  const dash = el.getAttribute("data-suppress-author") === "true" ? "-" : "";
  const body = keys.map((k) => `${dash}@${k}`).join("; ");
  return `[${prefix ? `${prefix} ` : ""}${body}${locator ? `, p. ${locator}` : ""}]`;
}

/** Parse the inside of a pandoc citation bracket into span attributes. */
function pandocToCitationSpan(inner: string): string {
  const keys: string[] = [];
  let prefix = "";
  let locator = "";
  let suppress = false;
  inner.split(";").forEach((segment, i) => {
    const m = /(-?)@([\w][\w:.#$%&+?<>~/-]*)/.exec(segment);
    if (!m) return;
    if (m[1] === "-") suppress = true;
    keys.push(m[2]);
    if (i === 0) prefix = segment.slice(0, m.index).trim();
    const tail = segment.slice(m.index + m[0].length);
    const loc = /,?\s*(?:pp?\.?|páginas?)\s*([\w., -]+)/i.exec(tail);
    if (loc) locator = loc[1].trim();
  });
  if (!keys.length) return `[${inner}]`;
  const attrs = [
    `data-citation=""`,
    `data-keys="${keys.join(",")}"`,
    locator && `data-locator="${locator}"`,
    prefix && `data-prefix="${prefix}"`,
    suppress && `data-suppress-author="true"`,
  ].filter(Boolean);
  return `<span ${attrs.join(" ")}></span>`;
}

/** Minimal HTML escaping for attribute values and text content. */
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

marked.setOptions({ gfm: true, breaks: false });
marked.use(markedFootnote());
marked.use({
  extensions: [
    {
      // Pandoc tex_math_dollars: $latex$ becomes an inline equation. Currency
      // guard: the opening $ can't be followed by whitespace, the closing $
      // can't be preceded by whitespace nor followed by a digit, and the
      // content must have something beyond digits/punctuation — so
      // "custa $50 e $60" stays plain text.
      name: "inlineMath",
      level: "inline",
      start(src: string) {
        return src.indexOf("$");
      },
      tokenizer(src: string) {
        const m = /^\$(?=[^$\n]*[^\d\s.,$])([^\s$](?:[^$\n]*[^\s$])?)\$(?!\d)/.exec(src);
        if (!m) return undefined;
        return { type: "inlineMath", raw: m[0], text: m[1] };
      },
      renderer(token) {
        const latex = (token as unknown as { text: string }).text;
        return `<span data-math="" data-latex="${escapeHtml(latex)}">${escapeHtml(latex)}</span>`;
      },
    },
    {
      name: "pandocCitation",
      level: "inline",
      start(src: string) {
        return src.indexOf("[");
      },
      tokenizer(src: string) {
        // Must contain a @citekey and not be a markdown link ("](").
        const m = /^\[([^\[\]]*?-?@[\w][^\[\]]*)\](?!\()/.exec(src);
        if (!m) return undefined;
        return { type: "pandocCitation", raw: m[0], text: m[1] };
      },
      renderer(token) {
        return pandocToCitationSpan((token as unknown as { text: string }).text);
      },
    },
  ],
});

// Pandoc header-attribute syntax ("## Título {#ref-abc}") carries the
// cross-reference id of a heading through Markdown; written by the
// headingWithRefId turndown rule below.
marked.use({
  renderer: {
    heading({ tokens, depth, text }) {
      const m = /\s*\{#([\w-]+)\}\s*$/.exec(text);
      let inner = this.parser.parseInline(tokens);
      if (!m) return `<h${depth}>${inner}</h${depth}>\n`;
      inner = inner.replace(/\s*\{#[\w-]+\}\s*$/, "");
      return `<h${depth} data-ref-id="${m[1]}">${inner}</h${depth}>\n`;
    },
  },
});

// Raw OOXML markers from docxFields.bakeNativeFieldsForDocx -> pandoc
// `<xml>`{=openxml} raw_attribute syntax. Inline runs only (never a full
// <w:p>: pandoc wraps raw blocks in their own paragraph, so a raw block
// that is itself a <w:p> produces invalid nested paragraphs). Requires the
// caller to export via pandoc's markdown reader with +raw_attribute, or
// this syntax round-trips back out as literal text.
function ooxmlRawReplacement(el: HTMLElement): string {
  const xml = el.getAttribute("data-ooxml") ?? "";
  if (!xml) return "";
  // Cached field text (heading/caption labels) can contain backticks; fence
  // with one more backtick than the longest run inside, same rule Markdown
  // code spans use, so the raw block never terminates early.
  const longestRun = Math.max(0, ...(xml.match(/`+/g) ?? []).map((r) => r.length));
  const fence = "`".repeat(longestRun + 1);
  // Trailing literal text (docxFields' " — " caption separator) rides along
  // in the SAME replacement string rather than a sibling text node: turndown
  // drops the leading whitespace of any text node that immediately follows a
  // blank-replaced inline element (pre-existing behavior — affects the plain
  // data-crossref passthrough too), so a separate " — " node would lose its
  // space here.
  const suffix = el.getAttribute("data-suffix") ?? "";
  return `${fence}${xml}${fence}{=openxml}${suffix}`;
}

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
  emDelimiter: "*",
  // Footnote refs and TOC markers are empty elements, which turndown
  // classifies as "blank" and replaces before any addRule() rule can match.
  // This hook is the only entry point that still sees them; everything else
  // keeps the default blank behavior (blocks become a break, inlines vanish).
  blankReplacement: (_content, node) => {
    const el = node as HTMLElement;
    if (el.nodeName === "SUP" && el.getAttribute?.("data-fn-ref")) {
      return `[^${fnLabel(el.getAttribute("data-fn-ref")!)}]`;
    }
    if (el.nodeName === "NAV" && el.hasAttribute?.("data-toc")) {
      // The attribute value distinguishes Sumário / Lista de Figuras / Tabelas.
      return `\n\n<nav data-toc="${el.getAttribute("data-toc") ?? ""}"></nav>\n\n`;
    }
    if (el.nodeName === "P" && el.hasAttribute?.("data-caption")) {
      return `\n\n${captionOpenTag(el)}</p>\n\n`;
    }
    if (el.nodeName === "SPAN" && el.hasAttribute?.("data-crossref")) {
      return `<span data-crossref="${el.getAttribute("data-crossref")}"></span>`;
    }
    if (el.nodeName === "SPAN" && el.hasAttribute?.("data-ooxml")) {
      return ooxmlRawReplacement(el);
    }
    // Block-level raw OOXML (exportPrep: a full <w:p> with alignment/indent).
    // A FENCED code block, not the inline backtick span — pandoc reads a
    // fenced ```{=openxml} as a RawBlock and inserts it at body level, so a
    // whole <w:p> is valid there (an inline raw would nest inside a run).
    if (el.nodeName === "DIV" && el.hasAttribute?.("data-ooxml-block")) {
      const xml = el.getAttribute("data-ooxml-block") ?? "";
      const longestRun = Math.max(0, ...(xml.match(/`+/g) ?? []).map((r) => r.length));
      const fence = "`".repeat(Math.max(3, longestRun + 1));
      return `\n\n${fence}{=openxml}\n${xml}\n${fence}\n\n`;
    }
    if (el.nodeName === "DIV" && el.hasAttribute?.("data-bibliography")) {
      return '\n\n<div data-bibliography=""></div>\n\n';
    }
    // A paragraph whose only content is raw-OOXML markers (exportPrep's page
    // break) is "blank" to turndown — textContent is empty — so it lands
    // here, never in the ooxmlRaw rule. Emit the raw inlines as their own
    // markdown paragraph: pandoc wraps them in a single <w:p>.
    if (el.nodeName === "P" && el.querySelector?.("span[data-ooxml]")) {
      const parts = Array.from(el.querySelectorAll("span[data-ooxml]")).map((s) =>
        ooxmlRawReplacement(s as HTMLElement)
      );
      return `\n\n${parts.join("")}\n\n`;
    }
    // Empty paragraphs are the user's blank lines (Enters espaçando o
    // texto); markdown has no syntax for them, so emit an NBSP entity —
    // pandoc and marked read it back as a one-line paragraph instead of
    // dropping the line. NBSP-filled paragraphs (exportPrep) land here too:
    // NBSP matches \s, so turndown classifies them as blank.
    if (el.nodeName === "P") {
      return "\n\n&nbsp;\n\n";
    }
    return (node as { isBlock?: boolean }).isBlock ? "\n\n" : "";
  },
});

// GFM: tables, strikethrough, task lists.
turndown.use(gfm);

// Subscript/superscript have no Markdown syntax; keep the raw HTML tags so the
// round-trip survives (pandoc also reads <sub>/<sup> into DOCX/ODT natively).
turndown.keep(["sub", "sup"]);

/** Opening tag for a caption block, preserving kind and cross-ref id. */
function captionOpenTag(el: HTMLElement): string {
  const kind = el.getAttribute("data-caption") === "table" ? "table" : "figure";
  const refId = el.getAttribute("data-ref-id");
  return `<p data-caption="${kind}"${refId ? ` data-ref-id="${refId}"` : ""}>`;
}

// Captions have no Markdown form — keep them as raw HTML blocks (marked hands
// block-level raw HTML back untouched, so the round-trip is lossless).
turndown.addRule("captionBlock", {
  filter: (node) => node.nodeName === "P" && node.hasAttribute("data-caption"),
  replacement: (_content, node) => {
    const el = node as HTMLElement;
    return `\n\n${captionOpenTag(el)}${el.innerHTML}</p>\n\n`;
  },
});

// Cross-references are empty inline spans; non-empty ones (never produced by
// the editor, but harmless) go through this rule, empty ones through the
// blankReplacement hook above.
turndown.addRule("crossrefSpan", {
  filter: (node) => node.nodeName === "SPAN" && node.hasAttribute("data-crossref"),
  replacement: (_content, node) =>
    `<span data-crossref="${(node as HTMLElement).getAttribute("data-crossref")}"></span>`,
});

// Headings that are cross-reference targets carry their id in pandoc's header
// attribute syntax ("## Título {#ref-abc}"), read back by the heading
// renderer below. Headings without a refId stay plain.
turndown.addRule("headingWithRefId", {
  filter: ["h1", "h2", "h3", "h4", "h5", "h6"],
  replacement: (content, node) => {
    const el = node as HTMLElement;
    const level = Number(el.nodeName[1]);
    const refId = el.getAttribute("data-ref-id");
    const suffix = refId ? ` {#${refId}}` : "";
    return `\n\n${"#".repeat(level)} ${content}${suffix}\n\n`;
  },
});

// Inline equations -> pandoc $latex$ syntax (round-trips through marked's
// inlineMath extension above; pandoc's markdown reader also parses it, which
// is how DOCX export gets native Word equations).
turndown.addRule("mathInline", {
  filter: (node) => node.nodeName === "SPAN" && node.hasAttribute("data-math"),
  replacement: (_content, node) => {
    const el = node as HTMLElement;
    const latex = (el.getAttribute("data-latex") ?? el.textContent ?? "").trim();
    return latex ? `$${latex}$` : "";
  },
});

// Raw OOXML markers from docxFields.bakeNativeFieldsForDocx — inline runs
// (never a full <w:p>: pandoc wraps raw blocks in their own paragraph, so a
// raw block that is itself a <w:p> produces invalid nested paragraphs).
// Requires the caller to export via pandoc's markdown reader with
// +raw_attribute, or this syntax round-trips back out as literal text.
turndown.addRule("ooxmlRaw", {
  filter: (node) => node.nodeName === "SPAN" && node.hasAttribute("data-ooxml"),
  replacement: (_content, node) => ooxmlRawReplacement(node as HTMLElement),
});

// Review data has no Markdown form — degrade gracefully: comments and pending
// insertions keep their text, pending deletions become GFM strikethrough.
turndown.addRule("reviewSpans", {
  filter: (node) =>
    node.nodeName === "SPAN" &&
    (node.hasAttribute("data-comment-id") ||
      node.hasAttribute("data-insertion") ||
      node.hasAttribute("data-deletion")),
  replacement: (content, node) =>
    (node as HTMLElement).hasAttribute("data-deletion") ? `~~${content}~~` : content,
});

// Footnotes -> pandoc/commonmark `[^n]` syntax. Labels are assigned per-conversion
// in body order; since notes are kept in ref order, the definitions line up.
const fnLabels = new Map<string, number>();
function fnLabel(id: string): number {
  if (!fnLabels.has(id)) fnLabels.set(id, fnLabels.size + 1);
  return fnLabels.get(id)!;
}

turndown.addRule("footnoteRef", {
  filter: (node) => node.nodeName === "SUP" && node.hasAttribute("data-fn-ref"),
  replacement: (_content, node) => `[^${fnLabel((node as HTMLElement).getAttribute("data-fn-ref")!)}]`,
});

turndown.addRule("footnotesSection", {
  filter: (node) => node.nodeName === "SECTION" && node.hasAttribute("data-footnotes"),
  replacement: (_content, node) => {
    const defs = Array.from((node as HTMLElement).querySelectorAll("[data-footnote]")).map((el) => {
      const id = el.getAttribute("data-footnote") || "";
      const text = turndown.turndown(el.innerHTML).replace(/\s*\n\s*/g, " ").trim();
      return `[^${fnLabel(id)}]: ${text}`;
    });
    return defs.length ? "\n\n" + defs.join("\n") + "\n" : "";
  },
});

/**
 * Convert pandoc's math spans (`<span class="math inline">\(E=mc^2\)</span>`,
 * emitted with --mathjax so the TeX source survives) into this app's
 * `span[data-math]` form. Display math (`\[...\]`) becomes inline — the
 * editor's math node is inline-only.
 */
export function mathFromPandoc(html: string): string {
  if (!html.includes('class="math')) return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("span.math").forEach((el) => {
    const latex = (el.textContent ?? "")
      .trim()
      .replace(/^\\[([]/, "")
      .replace(/\\[)\]]$/, "")
      .trim();
    if (!latex) {
      el.remove();
      return;
    }
    const span = doc.createElement("span");
    span.setAttribute("data-math", "");
    span.setAttribute("data-latex", latex);
    span.textContent = latex;
    el.replaceWith(span);
  });
  return doc.body.innerHTML;
}

// "Figura 1 — ", "Tabela 12 – " etc. at the start of a paragraph: the shape
// this app's own DOCX export produces AND what a Word SEQ caption looks like
// once its field is flattened to text by the import.
const CAPTION_LABEL_RE = /^\s*(Figura|Tabela)\s+\d+\s*[—–-]\s*/;

/**
 * Recover live document structure from a Word/ODT import: pandoc flattens
 * SEQ caption fields into plain "Figura 1 — …" paragraphs, REF
 * cross-references into static `<a href="#bookmark">` links, and bookmark
 * targets into empty `<span class="anchor">` markers. This turns them back
 * into this app's caption nodes (numbering recomputed live), `data-ref-id`
 * targets and crossref nodes — so an academic document round-trips as
 * structure, not as frozen text.
 *
 * Conservative on purpose: a paragraph only becomes a caption when it has a
 * bookmark anchor (a REF pointed at it — strongest signal) or matches the
 * exact dash-separated label shape; a link only becomes a crossref when its
 * target is an anchor recovered in the same pass (footnote/TOC links keep
 * working as links).
 */
export function fieldsFromPandoc(html: string): string {
  // Two independent signals, either enters the pass: bookmark anchors (REF
  // targets) and caption-shaped labels (a caption never referenced has no
  // bookmark, but must still round-trip as a caption node).
  if (!html.includes('class="anchor"') && !/(Figura|Tabela)\s+\d/.test(html)) return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const refIds = new Set<string>();

  // Caption paragraphs -> <p data-caption> nodes. The frozen "Figura N — "
  // prefix is stripped: the caption node renumbers itself in document order
  // (same number when the order didn't change).
  doc.querySelectorAll("p").forEach((p) => {
    const anchor = p.querySelector(":scope > span.anchor[id]");
    const text = (p.textContent ?? "").trim();
    const m = CAPTION_LABEL_RE.exec(text);
    if (!m) return;
    if (anchor) {
      p.setAttribute("data-ref-id", anchor.id);
      refIds.add(anchor.id);
      anchor.remove();
    }
    p.setAttribute("data-caption", m[1] === "Tabela" ? "table" : "figure");
    // The label is plain leading text; consume it across however many text
    // nodes it spans (marks never start before the caption body).
    let remaining = m[0].trimStart().length;
    while (remaining > 0 && p.firstChild) {
      const first = p.firstChild;
      if (first.nodeType !== Node.TEXT_NODE) break;
      const len = first.textContent?.length ?? 0;
      if (len <= remaining) {
        remaining -= len;
        first.remove();
      } else {
        first.textContent = (first.textContent ?? "").slice(remaining);
        remaining = 0;
      }
    }
  });

  // Headings that were REF targets carry an anchor span; move it into the
  // heading's persistent refId.
  doc.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((h) => {
    const anchor = h.querySelector("span.anchor[id]");
    if (!anchor) return;
    h.setAttribute("data-ref-id", anchor.id);
    refIds.add(anchor.id);
    anchor.remove();
  });

  // Internal links whose target we just recovered -> live crossref nodes.
  doc.querySelectorAll('a[href^="#"]').forEach((a) => {
    const id = decodeURIComponent((a.getAttribute("href") ?? "").slice(1));
    if (!refIds.has(id)) return;
    const span = doc.createElement("span");
    span.setAttribute("data-crossref", id);
    a.replaceWith(span);
  });

  return doc.body.innerHTML;
}

/** Drop the "↩" backlinks pandoc / marked-footnote add inside note bodies. */
export function stripFootnoteBackrefs(html: string): string {
  return html.replace(
    /<a\b[^>]*(?:data-footnote-backref|class="[^"]*footnote-back[^"]*"|role="doc-backlink")[^>]*>[\s\S]*?<\/a>/gi,
    ""
  );
}

export async function markdownToHtml(md: string): Promise<string> {
  const html = stripFootnoteBackrefs((await marked.parse(md)) as string);
  // NBSP-only paragraphs are the serialized form of the user's blank lines
  // (see blankReplacement) — restore them to truly empty paragraphs so the
  // editor treats them exactly like a fresh Enter.
  return html.replace(/<p>(?:&nbsp;|\u00a0)<\/p>/g, "<p></p>");
}

export function htmlToMarkdown(html: string): string {
  fnLabels.clear();

  // Citation spans are empty inline elements; turndown collapses the
  // whitespace around them ("texto [@a] e" would become "texto[@a]e") and
  // would also escape the brackets. Swap them for opaque text tokens first
  // and splice the pandoc syntax back in afterwards.
  const citations: string[] = [];
  let prepared = html;
  if (html.includes("data-citation")) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("span[data-citation]").forEach((el) => {
      citations.push(citationToPandoc(el as HTMLElement));
      el.replaceWith(doc.createTextNode(`\uE000${citations.length - 1}\uE000`));
    });
    prepared = doc.body.innerHTML;
  }

  let md = turndown.turndown(prepared).trim() + "\n";
  citations.forEach((text, i) => {
    md = md.replace(`\uE000${i}\uE000`, text);
  });
  return md;
}
