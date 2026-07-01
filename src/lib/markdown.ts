import { marked } from "marked";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

// Markdown <-> HTML bridge. The editor works on HTML internally (ProseMirror),
// and we (de)serialize to Markdown only when reading/writing .md/.txt files.

marked.setOptions({ gfm: true, breaks: false });

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
  emDelimiter: "*",
});

// GFM: tables, strikethrough, task lists.
turndown.use(gfm);

export async function markdownToHtml(md: string): Promise<string> {
  return (await marked.parse(md)) as string;
}

export function htmlToMarkdown(html: string): string {
  return turndown.turndown(html).trim() + "\n";
}
