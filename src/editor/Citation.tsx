import { useSyncExternalStore } from "react";
import { Node, mergeAttributes, Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion from "@tiptap/suggestion";
import { NodeViewProps, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import { suggestionPopup } from "./slash/popup";
import type { SlashItem } from "./slash/items";
import * as citationStore from "../lib/citationStore";
import { itemSummary } from "../lib/citationStore";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    citation: {
      /** Insert a citation cluster for the given citekeys. */
      insertCitation: (keys: string[], locator?: string) => ReturnType;
    };
  }
}

/**
 * Inline citation cluster, e.g. (SILVA, 2020, p. 45). The node stores only
 * the citekeys + qualifiers; the visible text is always produced live by the
 * citation store (citeproc), so switching CSL style reformats everything.
 */
function CitationView({ node }: NodeViewProps) {
  useSyncExternalStore(citationStore.subscribe, citationStore.getVersion);
  const data = {
    keys: String(node.attrs.keys ?? "").split(",").filter(Boolean),
    locator: node.attrs.locator ?? "",
    prefix: node.attrs.prefix ?? "",
    suppressAuthor: node.attrs.suppressAuthor === true,
  };
  const formatted = citationStore.formatCitation(data);
  return (
    <NodeViewWrapper
      as="span"
      className={"citation" + (formatted ? "" : " citation-missing")}
      title={formatted ? `Citação: ${data.keys.join(", ")}` : "Referência não encontrada na bibliografia"}
    >
      {formatted ?? citationStore.rawCitationText(data)}
    </NodeViewWrapper>
  );
}

export const Citation = Node.create({
  name: "citation",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      keys: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-keys") ?? "",
        renderHTML: (attrs) => ({ "data-keys": attrs.keys }),
      },
      locator: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-locator") ?? "",
        renderHTML: (attrs) => (attrs.locator ? { "data-locator": attrs.locator } : {}),
      },
      prefix: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-prefix") ?? "",
        renderHTML: (attrs) => (attrs.prefix ? { "data-prefix": attrs.prefix } : {}),
      },
      suppressAuthor: {
        default: false,
        parseHTML: (el) => el.getAttribute("data-suppress-author") === "true",
        renderHTML: (attrs) => (attrs.suppressAuthor ? { "data-suppress-author": "true" } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-citation]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-citation": "" })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CitationView);
  },

  addCommands() {
    return {
      insertCitation:
        (keys: string[], locator = "") =>
        ({ chain }) =>
          chain()
            .insertContent({ type: this.name, attrs: { keys: keys.join(","), locator } })
            .run(),
    };
  },
});

// ---------------------------------------------------------------------------
// "[@" autocomplete
// ---------------------------------------------------------------------------

function citationItems(query: string): SlashItem[] {
  const q = query.toLowerCase();
  return citationStore
    .getItems()
    .filter((item) => {
      const { authors, year } = itemSummary(item);
      const hay = `${item.id} ${authors} ${year} ${item.title ?? ""}`.toLowerCase();
      return hay.includes(q);
    })
    .slice(0, 8)
    .map((item) => {
      const { authors, year } = itemSummary(item);
      return {
        title: `${authors} (${year})`,
        subtitle: String(item.title ?? item.id),
        icon: "❞",
        keywords: "",
        command: ({ editor, range }) => {
          // Also eat the "[" trigger prefix, but only if it's really there —
          // extending blindly would swallow whatever character precedes it.
          const before = editor.state.doc.textBetween(Math.max(0, range.from - 1), range.from);
          const from = before === "[" ? range.from - 1 : range.from;
          editor
            .chain()
            .focus()
            .deleteRange({ from, to: range.to })
            .insertCitation([String(item.id)])
            .run();
        },
      };
    });
}

/** Typing "[@" opens reference autocomplete (like pandoc/RMarkdown). */
export const CitationSuggestion = Extension.create({
  name: "citationSuggestion",

  addProseMirrorPlugins() {
    return [
      Suggestion<SlashItem>({
        // Suggestion's default pluginKey is a shared constant — without an own
        // key this would collide with the slash menu and crash editor creation.
        pluginKey: new PluginKey("citationSuggestion"),
        editor: this.editor,
        char: "@",
        allowedPrefixes: ["["],
        startOfLine: false,
        items: ({ query }) => citationItems(query),
        command: ({ editor, range, props }) => {
          props.command({ editor, range });
        },
        render: suggestionPopup,
      }),
    ];
  },
});
