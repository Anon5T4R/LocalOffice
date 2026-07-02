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

marked.setOptions({ gfm: true, breaks: false });
marked.use(markedFootnote());
marked.use({
  extensions: [
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
      return '\n\n<nav data-toc=""></nav>\n\n';
    }
    if (el.nodeName === "DIV" && el.hasAttribute?.("data-bibliography")) {
      return '\n\n<div data-bibliography=""></div>\n\n';
    }
    return (node as { isBlock?: boolean }).isBlock ? "\n\n" : "";
  },
});

// GFM: tables, strikethrough, task lists.
turndown.use(gfm);

// Subscript/superscript have no Markdown syntax; keep the raw HTML tags so the
// round-trip survives (pandoc also reads <sub>/<sup> into DOCX/ODT natively).
turndown.keep(["sub", "sup"]);

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

/** Drop the "↩" backlinks pandoc / marked-footnote add inside note bodies. */
export function stripFootnoteBackrefs(html: string): string {
  return html.replace(
    /<a\b[^>]*(?:data-footnote-backref|class="[^"]*footnote-back[^"]*"|role="doc-backlink")[^>]*>[\s\S]*?<\/a>/gi,
    ""
  );
}

export async function markdownToHtml(md: string): Promise<string> {
  return stripFootnoteBackrefs((await marked.parse(md)) as string);
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
