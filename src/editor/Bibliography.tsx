import { useSyncExternalStore } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewProps, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import * as citationStore from "../lib/citationStore";
import { t } from "../lib/i18n";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    bibliography: {
      /** Insert the formatted reference list block. */
      insertBibliography: () => ReturnType;
    };
  }
}

/**
 * Reference list. The node stores nothing — the entries come from the citation
 * store (citeproc formats every work cited in the document, in the active CSL
 * style). Export bakes the same list into static HTML.
 */
function BibliographyView(_props: NodeViewProps) {
  useSyncExternalStore(citationStore.subscribe, citationStore.getVersion);
  const engine = citationStore.getEngine();
  const entries = engine?.formatBibliography() ?? [];

  return (
    <NodeViewWrapper className="bibliography-block" contentEditable={false}>
      <div className="bibliography-header">Referências</div>
      {!engine && (
        <div className="bibliography-empty">{t("biblio.notConfigured")}</div>
      )}
      {engine && entries.length === 0 && (
        <div className="bibliography-empty">{t("biblio.noWorks")}</div>
      )}
      {/* citeproc output is generated locally from the user's own bibliography */}
      <div dangerouslySetInnerHTML={{ __html: entries.join("\n") }} />
    </NodeViewWrapper>
  );
}

export const Bibliography = Node.create({
  name: "bibliography",
  group: "block",
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: "div[data-bibliography]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-bibliography": "" })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(BibliographyView);
  },

  addCommands() {
    return {
      insertBibliography:
        () =>
        ({ chain }) =>
          chain().insertContent({ type: this.name }).run(),
    };
  },
});
