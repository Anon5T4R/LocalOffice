import { Node, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";
import { MAINTENANCE_META } from "./maintenanceMeta";
import { newId } from "../lib/id";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    footnotes: {
      /** Insert a footnote reference at the cursor and a matching note at the end. */
      addFootnote: () => ReturnType;
    };
  }
}

/**
 * Footnotes: a reference (`footnoteRef`, inline) tied by id to a note
 * (`footnote`) living in a single `footnotes` section at the end of the doc.
 *
 * Numbers are never stored — they come from CSS counters (see App.css), so the
 * only invariant we must keep is that notes stay in the same order as their
 * refs. A maintenance plugin enforces that, drops orphan notes, and pins the
 * section to the end of the document.
 */

const key = new PluginKey("footnotes-maintenance");

/** Reference marker rendered as <sup data-fn-ref="id">; the number is CSS-driven. */
export const FootnoteRef = Node.create({
  name: "footnoteRef",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-fn-ref"),
        renderHTML: (attrs) => (attrs.id ? { "data-fn-ref": attrs.id } : {}),
      },
    };
  },

  parseHTML() {
    // The id must equal the matching note's id. marked-footnote and pandoc both
    // point the ref anchor at "#<noteId>", so we take the id from the href.
    const fromHref = (el: HTMLElement) => {
      const href = el.getAttribute("href") || "";
      return { id: href.replace(/^#/, "") || el.getAttribute("id") || newId("fn-") };
    };
    return [
      // Priority must beat the Superscript mark's generic `sup` rule (50), or it
      // consumes the element as an empty mark and the ref node is dropped.
      { tag: "sup[data-fn-ref]", priority: 100 },
      { tag: "a[data-footnote-ref]", getAttrs: (el) => fromHref(el as HTMLElement), priority: 100 },
      { tag: "a[role='doc-noteref']", getAttrs: (el) => fromHref(el as HTMLElement), priority: 100 },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["sup", mergeAttributes(HTMLAttributes, { class: "footnote-ref" })];
  },
});

/** A single note. Block content, addressed by id, only valid inside `footnotes`. */
export const Footnote = Node.create({
  name: "footnote",
  content: "paragraph+",
  defining: true,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-footnote") || el.getAttribute("id"),
        renderHTML: (attrs) => (attrs.id ? { "data-footnote": attrs.id } : {}),
      },
    };
  },

  parseHTML() {
    return [
      { tag: "div[data-footnote]" },
      // pandoc (id="fn1") / marked-footnote (id="footnote-1") import.
      {
        tag: "li",
        getAttrs: (el) => {
          const id = (el as HTMLElement).getAttribute("id") || "";
          return /^(fn|footnote)/i.test(id) ? { id } : false;
        },
        priority: 60,
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { class: "footnote-item" }), 0];
  },
});

/** The single container holding every note, pinned to the end of the document. */
export const Footnotes = Node.create({
  name: "footnotes",
  group: "block",
  content: "footnote+",
  isolating: true,
  defining: true,

  parseHTML() {
    return [{ tag: "section[data-footnotes]" }, { tag: "section.footnotes", priority: 60 }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["section", mergeAttributes(HTMLAttributes, { "data-footnotes": "", class: "footnotes" }), 0];
  },

  addCommands() {
    return {
      addFootnote:
        () =>
        ({ state, dispatch }) => {
          const { schema, doc, selection } = state;
          const refType = schema.nodes.footnoteRef;
          const noteType = schema.nodes.footnote;
          const sectionType = schema.nodes.footnotes;
          const paraType = schema.nodes.paragraph;
          if (!refType || !noteType || !sectionType || !paraType) return false;

          // Don't nest a ref inside the notes section itself.
          let insideNotes = false;
          doc.nodesBetween(selection.from, selection.to, (node) => {
            if (node.type === sectionType) insideNotes = true;
          });
          if (insideNotes) return false;

          const id = newId("fn-");
          const tr = state.tr;

          // 1. Insert the reference after the current selection.
          tr.insert(selection.to, refType.create({ id }));

          // 2. Locate an existing section (should be the last child).
          let sectionPos: number | null = null;
          let sectionNode: PMNode | null = null;
          tr.doc.forEach((child, offset) => {
            if (child.type === sectionType) {
              sectionPos = offset;
              sectionNode = child;
            }
          });

          const note = noteType.create({ id }, paraType.create());
          let caret: number;
          if (sectionNode == null) {
            const atEnd = tr.doc.content.size;
            tr.insert(atEnd, sectionType.create(null, note));
            caret = atEnd + 3; // enter section + note + paragraph
          } else {
            const insertAt = sectionPos! + (sectionNode as PMNode).nodeSize - 1;
            tr.insert(insertAt, note);
            caret = insertAt + 2; // enter note + paragraph
          }

          tr.setSelection(TextSelection.create(tr.doc, caret)).scrollIntoView();
          if (dispatch) dispatch(tr);
          return true;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      "Mod-Alt-f": () => this.editor.commands.addFootnote(),
    };
  },

  addProseMirrorPlugins() {
    const sectionName = this.name;
    return [
      new Plugin({
        key,
        // Keep notes ordered by their refs and drop orphans. The section's
        // *position* is deliberately not enforced: StarterKit's trailing-node
        // plugin keeps a paragraph at the end of the doc, so pinning the
        // section to the end would make the two plugins re-append forever.
        // We rewrite the existing section in place instead.
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((t) => t.docChanged)) return null;
          const { schema, doc } = newState;
          const sectionType = schema.nodes[sectionName];
          const refType = schema.nodes.footnoteRef;
          const noteType = schema.nodes.footnote;

          // Ref ids in body order (skip anything inside a notes section).
          const refIds: string[] = [];
          doc.descendants((node) => {
            if (node.type === sectionType) return false;
            if (node.type === refType && node.attrs.id && !refIds.includes(node.attrs.id)) {
              refIds.push(node.attrs.id);
            }
            return true;
          });

          // Collect every existing section (usually one) and its notes.
          const sections: { pos: number; node: PMNode }[] = [];
          const notesById = new Map<string, PMNode>();
          doc.forEach((child, offset) => {
            if (child.type === sectionType) {
              sections.push({ pos: offset, node: child });
              child.forEach((n) => {
                if (n.type === noteType && n.attrs.id && !notesById.has(n.attrs.id)) {
                  notesById.set(n.attrs.id, n);
                }
              });
            }
          });

          // No refs left -> remove any sections.
          if (refIds.length === 0) {
            if (sections.length === 0) return null;
            const tr = newState.tr;
            for (let i = sections.length - 1; i >= 0; i--) {
              tr.delete(sections[i].pos, sections[i].pos + sections[i].node.nodeSize);
            }
            return tr.setMeta(MAINTENANCE_META, true);
          }

          // Single section whose notes already match ref order -> nothing to do.
          if (sections.length === 1) {
            const ids: (string | null)[] = [];
            sections[0].node.forEach((n) => ids.push(n.attrs.id));
            if (ids.length === refIds.length && ids.every((v, i) => v === refIds[i])) return null;
          }

          const desired = refIds.map(
            (id) => notesById.get(id) ?? noteType.create({ id }, schema.nodes.paragraph.create())
          );

          // Not setting addToHistory:false on purpose: appended transactions fold
          // into the same history event, so undoing a ref deletion also restores
          // its note (with content) in a single Ctrl+Z. The maintenance flag
          // keeps it out of change tracking without touching history.
          const tr = newState.tr;
          tr.setMeta(MAINTENANCE_META, true);
          if (sections.length === 0) {
            tr.insert(doc.content.size, sectionType.create(null, desired));
          } else {
            // Drop extra sections back-to-front (positions before them stay valid),
            // then rewrite the first one's children in place.
            for (let i = sections.length - 1; i >= 1; i--) {
              tr.delete(sections[i].pos, sections[i].pos + sections[i].node.nodeSize);
            }
            const { pos, node } = sections[0];
            tr.replaceWith(pos + 1, pos + node.nodeSize - 1, desired);
          }
          return tr.docChanged ? tr : null;
        },
        props: {
          // Clicking a reference scrolls to its note.
          handleClick: (view, _pos, event) => {
            const target = event.target as HTMLElement;
            const refEl = target.closest?.("[data-fn-ref]");
            if (refEl) {
              const id = refEl.getAttribute("data-fn-ref");
              const noteEl = id && view.dom.querySelector(`[data-footnote="${CSS.escape(id)}"]`);
              if (noteEl) {
                (noteEl as HTMLElement).scrollIntoView({ behavior: "smooth", block: "center" });
                return true;
              }
            }
            return false;
          },
        },
      }),
    ];
  },
});
