import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export interface Match {
  from: number;
  to: number;
}

export interface SearchState {
  term: string;
  results: Match[];
  current: number;
}

export const searchKey = new PluginKey<SearchState>("search");

function computeResults(doc: PMNode, term: string): Match[] {
  const results: Match[] = [];
  if (!term) return results;
  const needle = term.toLowerCase();
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const hay = node.text.toLowerCase();
    let i = 0;
    while ((i = hay.indexOf(needle, i)) !== -1) {
      results.push({ from: pos + i, to: pos + i + term.length });
      i += term.length;
    }
  });
  return results;
}

function buildDecorations(doc: PMNode, state: SearchState): DecorationSet {
  if (!state.results.length) return DecorationSet.empty;
  const decos = state.results.map((r, idx) =>
    Decoration.inline(r.from, r.to, {
      class: idx === state.current ? "search-current" : "search-match",
    })
  );
  return DecorationSet.create(doc, decos);
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    search: {
      setSearchTerm: (term: string) => ReturnType;
      findNext: () => ReturnType;
      findPrev: () => ReturnType;
      clearSearch: () => ReturnType;
    };
  }
}

export const SearchExtension = Extension.create({
  name: "search",

  addProseMirrorPlugins() {
    return [
      new Plugin<SearchState>({
        key: searchKey,
        state: {
          init: () => ({ term: "", results: [], current: 0 }),
          apply(tr, value, _old, newState) {
            const meta = tr.getMeta(searchKey) as Partial<SearchState> | undefined;
            let next = value;
            if (meta) next = { ...value, ...meta };
            // Keep results in sync when the document changes under an active search.
            if (!meta && tr.docChanged && next.term) {
              const results = computeResults(newState.doc, next.term);
              next = { ...next, results, current: Math.min(next.current, Math.max(0, results.length - 1)) };
            }
            return next;
          },
        },
        props: {
          decorations(state) {
            const s = searchKey.getState(state);
            return s ? buildDecorations(state.doc, s) : null;
          },
        },
      }),
    ];
  },

  addCommands() {
    const selectMatch = (tr: import("@tiptap/pm/state").Transaction, m: Match) =>
      tr.setSelection(TextSelection.create(tr.doc, m.from, m.to)).scrollIntoView();

    return {
      setSearchTerm:
        (term: string) =>
        ({ state, dispatch }) => {
          const results = computeResults(state.doc, term);
          const tr = state.tr.setMeta(searchKey, { term, results, current: 0 });
          if (results[0]) selectMatch(tr, results[0]);
          dispatch?.(tr);
          return true;
        },
      findNext:
        () =>
        ({ state, dispatch }) => {
          const s = searchKey.getState(state);
          if (!s || !s.results.length) return false;
          const current = (s.current + 1) % s.results.length;
          const tr = state.tr.setMeta(searchKey, { current });
          selectMatch(tr, s.results[current]);
          dispatch?.(tr);
          return true;
        },
      findPrev:
        () =>
        ({ state, dispatch }) => {
          const s = searchKey.getState(state);
          if (!s || !s.results.length) return false;
          const current = (s.current - 1 + s.results.length) % s.results.length;
          const tr = state.tr.setMeta(searchKey, { current });
          selectMatch(tr, s.results[current]);
          dispatch?.(tr);
          return true;
        },
      clearSearch:
        () =>
        ({ state, dispatch }) => {
          dispatch?.(state.tr.setMeta(searchKey, { term: "", results: [], current: 0 }));
          return true;
        },
    };
  },
});
