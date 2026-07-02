/**
 * Behavior tests for the two most intricate ProseMirror plugins in the app,
 * running a REAL TipTap editor headless in jsdom (not mocks): the
 * TrackChanges appendTransaction rewriting and the Footnotes maintenance
 * plugin (note ordering / orphan dropping / section lifecycle).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import type { Node as PMNode } from "@tiptap/pm/model";
import { FootnoteRef, Footnote, Footnotes } from "./Footnotes";
import { CommentMark, InsertionMark, DeletionMark, TrackChanges } from "./Review";

// jsdom doesn't implement layout measurement on Range; ProseMirror's
// scrollIntoView path calls these. Zeroed stubs are enough — nothing in
// these tests depends on real geometry.
const zeroRect = {
  x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0,
  toJSON: () => ({}),
} as DOMRect;
Range.prototype.getBoundingClientRect = () => zeroRect;
Range.prototype.getClientRects = () =>
  ({ length: 0, item: () => null, [Symbol.iterator]: [].values } as unknown as DOMRectList);
HTMLElement.prototype.scrollIntoView = () => {};

function makeEditor(): Editor {
  return new Editor({
    extensions: [
      StarterKit,
      FootnoteRef,
      Footnote,
      Footnotes,
      CommentMark,
      InsertionMark,
      DeletionMark,
      TrackChanges.configure({ getAuthor: () => "Tester" }),
    ],
    content: "<p>hello world</p>",
  });
}

/** All text nodes carrying the named mark, with their text. */
function markedText(doc: PMNode, markName: string): string[] {
  const out: string[] = [];
  doc.descendants((node) => {
    if (node.isText && node.marks.some((m) => m.type.name === markName)) {
      out.push(node.text ?? "");
    }
  });
  return out;
}

/** Ids of footnote refs in body order / note ids in section order. */
function footnoteState(doc: PMNode): { refs: string[]; notes: string[]; sections: number } {
  const refs: string[] = [];
  const notes: string[] = [];
  let sections = 0;
  doc.descendants((node) => {
    if (node.type.name === "footnotes") {
      sections++;
      node.forEach((n) => notes.push(n.attrs.id));
      return false;
    }
    if (node.type.name === "footnoteRef") refs.push(node.attrs.id);
    return true;
  });
  return { refs, notes, sections };
}

describe("TrackChanges (appendTransaction real, editor headless)", () => {
  let editor: Editor;
  beforeEach(() => {
    editor = makeEditor();
    editor.commands.setTrackChanges(true);
  });

  it("texto inserido ganha a marca insertion com o autor", () => {
    editor.commands.insertContentAt(6, "XYZ");
    expect(markedText(editor.state.doc, "insertion")).toEqual(["XYZ"]);
    let author = "";
    editor.state.doc.descendants((n) => {
      const m = n.marks.find((mk) => mk.type.name === "insertion");
      if (m) author = m.attrs.author;
    });
    expect(author).toBe("Tester");
  });

  it("texto apagado permanece no doc, riscado com a marca deletion", () => {
    editor.commands.deleteRange({ from: 1, to: 6 }); // "hello"
    expect(editor.state.doc.textContent).toBe("hello world");
    expect(markedText(editor.state.doc, "deletion")).toEqual(["hello"]);
  });

  it("apagar uma inserção pendente remove de verdade (sem virar deletion)", () => {
    editor.commands.insertContentAt(6, "XYZ");
    // the pending insertion sits at 6..9
    editor.commands.deleteRange({ from: 6, to: 9 });
    expect(editor.state.doc.textContent).toBe("hello world");
    expect(markedText(editor.state.doc, "deletion")).toEqual([]);
  });

  it("resolveAllChanges(aceitar) limpa as marcas e some com o texto riscado", () => {
    editor.commands.insertContentAt(6, "XYZ");
    editor.commands.deleteRange({ from: 10, to: 15 }); // part of "world" -> tracked deletion
    editor.commands.resolveAllChanges(true);
    expect(markedText(editor.state.doc, "insertion")).toEqual([]);
    expect(markedText(editor.state.doc, "deletion")).toEqual([]);
    expect(editor.state.doc.textContent).toContain("XYZ"); // insertion kept
  });

  it("resolveAllChanges(rejeitar) desfaz a inserção e restaura o apagado", () => {
    editor.commands.insertContentAt(6, "XYZ");
    editor.commands.resolveAllChanges(false);
    expect(editor.state.doc.textContent).toBe("hello world");
    expect(markedText(editor.state.doc, "insertion")).toEqual([]);
  });

  it("com o tracking desligado nada é marcado", () => {
    editor.commands.setTrackChanges(false);
    editor.commands.insertContentAt(6, "XYZ");
    editor.commands.deleteRange({ from: 1, to: 3 });
    expect(markedText(editor.state.doc, "insertion")).toEqual([]);
    expect(markedText(editor.state.doc, "deletion")).toEqual([]);
  });
});

describe("Footnotes (plugin de manutenção real, editor headless)", () => {
  let editor: Editor;
  beforeEach(() => {
    editor = makeEditor();
  });

  it("addFootnote cria ref + seção com nota do mesmo id", () => {
    editor.commands.setTextSelection(6);
    editor.commands.addFootnote();
    const s = footnoteState(editor.state.doc);
    expect(s.sections).toBe(1);
    expect(s.refs).toHaveLength(1);
    expect(s.notes).toEqual(s.refs);
  });

  it("notas seguem a ordem dos refs no corpo", () => {
    editor.commands.setTextSelection(11);
    editor.commands.addFootnote(); // fn B no fim do texto
    editor.commands.setTextSelection(3);
    editor.commands.addFootnote(); // fn A no meio -- vem ANTES no corpo
    const s = footnoteState(editor.state.doc);
    expect(s.refs).toHaveLength(2);
    expect(s.notes).toEqual(s.refs); // reordenadas pela manutenção
  });

  it("apagar um ref derruba a nota órfã e preserva a outra", () => {
    editor.commands.setTextSelection(6);
    editor.commands.addFootnote();
    editor.commands.setTextSelection(3);
    editor.commands.addFootnote();
    const before = footnoteState(editor.state.doc);
    expect(before.refs).toHaveLength(2);

    // delete the FIRST ref in body order
    let refPos = -1;
    editor.state.doc.descendants((node, pos) => {
      if (refPos === -1 && node.type.name === "footnoteRef" && node.attrs.id === before.refs[0]) refPos = pos;
      return refPos === -1;
    });
    editor.commands.deleteRange({ from: refPos, to: refPos + 1 });

    const after = footnoteState(editor.state.doc);
    expect(after.refs).toEqual([before.refs[1]]);
    expect(after.notes).toEqual([before.refs[1]]);
  });

  it("apagar o último ref remove a seção inteira", () => {
    editor.commands.setTextSelection(6);
    editor.commands.addFootnote();
    let refPos = -1;
    editor.state.doc.descendants((node, pos) => {
      if (refPos === -1 && node.type.name === "footnoteRef") refPos = pos;
      return refPos === -1;
    });
    editor.commands.deleteRange({ from: refPos, to: refPos + 1 });
    expect(footnoteState(editor.state.doc).sections).toBe(0);
  });

  it("undo de apagar um ref restaura a nota junto (um Ctrl+Z só)", () => {
    editor.commands.setTextSelection(6);
    editor.commands.addFootnote();
    const withNote = footnoteState(editor.state.doc);
    let refPos = -1;
    editor.state.doc.descendants((node, pos) => {
      if (refPos === -1 && node.type.name === "footnoteRef") refPos = pos;
      return refPos === -1;
    });
    editor.commands.deleteRange({ from: refPos, to: refPos + 1 });
    expect(footnoteState(editor.state.doc).sections).toBe(0);
    editor.commands.undo();
    expect(footnoteState(editor.state.doc)).toEqual(withNote);
  });
});
