import { Extension, Mark, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import type { Node as PMNode, Slice, Mark as PMMark } from "@tiptap/pm/model";
import { Mapping, ReplaceStep } from "@tiptap/pm/transform";
import { MAINTENANCE_META } from "./maintenanceMeta";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    review: {
      /** Attach a comment to the current selection. */
      addComment: (text: string, author: string) => ReturnType;
      /** Update a comment's text / resolved state everywhere it appears. */
      updateComment: (id: string, patch: { text?: string; resolved?: boolean }) => ReturnType;
      /** Remove a comment (the text keeps only its other marks). */
      removeComment: (id: string) => ReturnType;
      /** Turn tracked-changes recording on or off. */
      setTrackChanges: (enabled: boolean) => ReturnType;
      /** Accept or reject one tracked change range. */
      resolveChange: (range: { from: number; to: number }, kind: "insertion" | "deletion", accept: boolean) => ReturnType;
      /** Accept or reject every tracked change in the document. */
      resolveAllChanges: (accept: boolean) => ReturnType;
    };
  }
}

function newId(): string {
  return `c-${Math.random().toString(36).slice(2, 9)}`;
}

// ---------------------------------------------------------------------------
// Marks
// ---------------------------------------------------------------------------

/**
 * Comment: highlights a range and carries the note itself in the attrs, so a
 * saved .html file is fully self-contained. All spans of one comment share id.
 */
export const CommentMark = Mark.create({
  name: "comment",
  // Don't grow while typing at the edges.
  inclusive: false,

  addAttributes() {
    // renderHTML: none — the mark-level renderHTML below emits the data-*
    // attributes; without this TipTap would also emit each attr by its raw
    // name (text="…", author="…"), duplicating everything in saved files.
    const none = () => ({});
    return {
      id: { default: null, parseHTML: (el) => el.getAttribute("data-comment-id"), renderHTML: none },
      text: { default: "", parseHTML: (el) => el.getAttribute("data-comment-text") ?? "", renderHTML: none },
      author: { default: "", parseHTML: (el) => el.getAttribute("data-comment-author") ?? "", renderHTML: none },
      ts: {
        default: 0,
        parseHTML: (el) => Number(el.getAttribute("data-comment-ts")) || 0,
        renderHTML: none,
      },
      resolved: {
        default: false,
        parseHTML: (el) => el.getAttribute("data-comment-resolved") === "true",
        renderHTML: none,
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-comment-id]" }];
  },

  renderHTML({ HTMLAttributes, mark }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-comment-id": mark.attrs.id,
        "data-comment-text": mark.attrs.text,
        "data-comment-author": mark.attrs.author,
        "data-comment-ts": String(mark.attrs.ts),
        ...(mark.attrs.resolved && { "data-comment-resolved": "true" }),
        class: mark.attrs.resolved ? "comment-anchor is-resolved" : "comment-anchor",
      }),
      0,
    ];
  },

  addCommands() {
    return {
      addComment:
        (text: string, author: string) =>
        ({ state, commands }) => {
          if (state.selection.empty) return false;
          return commands.setMark(this.name, { id: newId(), text, author, ts: Date.now() });
        },
      updateComment:
        (id: string, patch: { text?: string; resolved?: boolean }) =>
        ({ state, dispatch }) => {
          const tr = state.tr;
          forEachMarkRange(state.doc, this.name, (node, pos, mark) => {
            if (mark.attrs.id !== id) return;
            tr.addMark(
              pos,
              pos + node.nodeSize,
              mark.type.create({ ...mark.attrs, ...patch })
            );
          });
          if (!tr.steps.length) return false;
          if (dispatch) dispatch(tr);
          return true;
        },
      removeComment:
        (id: string) =>
        ({ state, dispatch }) => {
          const tr = state.tr;
          forEachMarkRange(state.doc, this.name, (node, pos, mark) => {
            if (mark.attrs.id !== id) return;
            tr.removeMark(pos, pos + node.nodeSize, mark);
          });
          if (!tr.steps.length) return false;
          if (dispatch) dispatch(tr);
          return true;
        },
    };
  },
});

/** Shared shape of the insertion/deletion marks. */
function trackedMark(name: "insertion" | "deletion", dataAttr: string, className: string) {
  return Mark.create({
    name,
    inclusive: name === "insertion",

    addAttributes() {
      const none = () => ({});
      return {
        author: {
          default: "",
          parseHTML: (el) => el.getAttribute("data-author") ?? el.getAttribute("author") ?? "",
          renderHTML: none,
        },
        ts: {
          default: 0,
          // Our own files carry data-ts (ms); pandoc imports carry an ISO date.
          parseHTML: (el) =>
            Number(el.getAttribute("data-ts")) ||
            Date.parse(el.getAttribute("data-date") ?? el.getAttribute("date") ?? "") ||
            0,
          renderHTML: none,
        },
      };
    },

    parseHTML() {
      return [
        { tag: `span[${dataAttr}]` },
        // pandoc docx import (--track-changes=all) emits these classes.
        { tag: `span.${name}`, priority: 60 },
        { tag: name === "insertion" ? "ins" : "del", priority: 60 },
      ];
    },

    renderHTML({ HTMLAttributes, mark }) {
      return [
        "span",
        mergeAttributes(HTMLAttributes, {
          [dataAttr]: "",
          "data-author": mark.attrs.author,
          "data-ts": String(mark.attrs.ts),
          class: className,
        }),
        0,
      ];
    },
  });
}

export const InsertionMark = trackedMark("insertion", "data-insertion", "track-ins");
export const DeletionMark = trackedMark("deletion", "data-deletion", "track-del");

/** Walk every text node carrying the given mark type. */
function forEachMarkRange(
  doc: PMNode,
  markName: string,
  fn: (node: PMNode, pos: number, mark: PMMark) => void
): void {
  doc.descendants((node, pos) => {
    node.marks.forEach((mark) => {
      if (mark.type.name === markName) fn(node, pos, mark);
    });
    return true;
  });
}

// ---------------------------------------------------------------------------
// Track-changes recording
// ---------------------------------------------------------------------------

export const trackChangesKey = new PluginKey<{ enabled: boolean }>("trackChanges");

interface TrackOptions {
  /** Author name recorded on each change (kept current from settings). */
  getAuthor: () => string;
}

/**
 * When recording is on, edits are rewritten after the fact: inserted inline
 * content gains the `insertion` mark and deleted inline content is re-inserted
 * struck-through with the `deletion` mark. Structural changes (splitting
 * paragraphs, tables…) pass through untracked — same pragmatic line Word draws
 * for complex operations, and it keeps this plugin small enough to trust.
 */
export const TrackChanges = Extension.create<TrackOptions>({
  name: "trackChanges",

  addOptions() {
    return { getAuthor: () => "Autor" };
  },

  addCommands() {
    return {
      setTrackChanges:
        (enabled: boolean) =>
        ({ tr, dispatch }) => {
          if (dispatch) dispatch(tr.setMeta(trackChangesKey, { enabled }));
          return true;
        },
      resolveChange:
        (range, kind, accept) =>
        ({ state, dispatch }) => {
          const tr = state.tr;
          const keep = (kind === "insertion") === accept;
          if (keep) {
            tr.removeMark(range.from, range.to, state.schema.marks[kind]);
          } else {
            tr.delete(range.from, range.to);
          }
          tr.setMeta(trackChangesKey, "internal");
          if (dispatch) dispatch(tr);
          return true;
        },
      resolveAllChanges:
        (accept: boolean) =>
        ({ state, dispatch }) => {
          const tr = state.tr;
          const ranges: { from: number; to: number; kind: "insertion" | "deletion" }[] = [];
          for (const kind of ["insertion", "deletion"] as const) {
            forEachMarkRange(state.doc, kind, (node, pos) => {
              ranges.push({ from: pos, to: pos + node.nodeSize, kind });
            });
          }
          // Back-to-front so deletions don't shift the earlier positions.
          ranges.sort((a, b) => b.from - a.from);
          for (const r of ranges) {
            const keep = (r.kind === "insertion") === accept;
            if (keep) tr.removeMark(r.from, r.to, state.schema.marks[r.kind]);
            else tr.delete(r.from, r.to);
          }
          tr.setMeta(trackChangesKey, "internal");
          if (dispatch) dispatch(tr);
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const getAuthor = this.options.getAuthor;

    return [
      new Plugin({
        key: trackChangesKey,
        state: {
          init: () => ({ enabled: false }),
          apply: (tr, prev) => {
            const meta = tr.getMeta(trackChangesKey);
            return meta && typeof meta === "object" && "enabled" in meta
              ? { enabled: meta.enabled as boolean }
              : prev;
          },
        },

        appendTransaction: (transactions, _oldState, newState) => {
          if (!trackChangesKey.getState(newState)?.enabled) return null;

          // Only rewrite organic edits — not undo/redo, not our own output,
          // not the maintenance work of other plugins (e.g. footnote
          // renumbering, which folds into history yet must stay untracked).
          const organic = transactions.filter(
            (tr) =>
              tr.docChanged &&
              tr.getMeta(trackChangesKey) === undefined &&
              tr.getMeta(MAINTENANCE_META) !== true &&
              tr.getMeta("history$") === undefined &&
              tr.getMeta("addToHistory") !== false
          );
          if (!organic.length) return null;

          const schema = newState.schema;
          const insType = schema.marks.insertion;
          const delType = schema.marks.deletion;
          const author = getAuthor();
          const ts = Date.now();

          // Flatten steps (with their doc-before) and build, for each step,
          // the mapping from its after-doc to the final doc.
          const steps: { step: ReplaceStep; docBefore: PMNode }[] = [];
          for (const tr of organic) {
            tr.steps.forEach((step, i) => {
              if (!(step instanceof ReplaceStep)) return;
              const docBefore = tr.docs[i];
              // A step covering the whole doc is a document load (setContent),
              // not an edit — no organic typing ever replaces 0..size exactly.
              if (step.from === 0 && step.to === docBefore.content.size) return;
              steps.push({ step, docBefore });
            });
          }
          if (!steps.length) return null;

          const changes: { pos: number; insertedLen: number; deleted: Slice }[] = [];
          for (let i = 0; i < steps.length; i++) {
            const { step, docBefore } = steps[i];
            const after = new Mapping(steps.slice(i + 1).map((s) => s.step.getMap()));
            changes.push({
              pos: after.map(step.from, -1),
              insertedLen: step.slice.size,
              deleted: docBefore.slice(step.from, step.to),
            });
          }

          const tr = newState.tr;
          // Back-to-front keeps earlier positions valid while we insert text.
          changes.sort((a, b) => b.pos - a.pos);

          for (const change of changes) {
            // 1. Mark what was inserted.
            if (change.insertedLen > 0) {
              tr.addMark(change.pos, change.pos + change.insertedLen, insType.create({ author, ts }));
            }

            // 2. Re-insert what was deleted, struck through. Only inline
            //    content — structural deletions stay untracked.
            const frag = change.deleted.content;
            let allInline = true;
            frag.descendants((n) => {
              if (!n.isInline) allInline = false;
              return allInline;
            });
            if (frag.size === 0 || !allInline || frag.firstChild?.isBlock) continue;

            const reinserted: PMNode[] = [];
            let skip = true; // becomes false if anything needs re-inserting
            frag.forEach((n) => {
              if (delType.isInSet(n.marks)) {
                // Deleting already-deleted text: keep it as-is.
                reinserted.push(n);
                return;
              }
              if (insType.isInSet(n.marks)) {
                // Deleting a pending insertion really removes it.
                return;
              }
              skip = false;
              reinserted.push(n.mark(delType.create({ author, ts }).addToSet(n.marks)));
            });
            if (!skip && reinserted.length) {
              tr.insert(change.pos + change.insertedLen, reinserted);
              // Keep the caret before the struck text (like Word on backspace).
              if (change.insertedLen === 0) {
                tr.setSelection(TextSelection.near(tr.doc.resolve(change.pos)));
              }
            }
          }

          if (!tr.steps.length) return null;
          tr.setMeta(trackChangesKey, "internal");
          return tr;
        },
      }),
    ];
  },
});
