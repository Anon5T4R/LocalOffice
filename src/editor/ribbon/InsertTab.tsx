import { useState } from "react";
import { useEditorState } from "@tiptap/react";
import { useEditorInstance } from "../../state/EditorContext";
import { Modal } from "../../components/Modal";
import { listCrossRefTargets, type CrossRefTarget } from "../CrossRef";
import { Btn } from "./Btn";

/** "Inserir": tabelas, imagem, link, quebras, notas, sumário, citações. */
export function InsertTab({ onInsertImage }: { onInsertImage: () => void }) {
  const editor = useEditorInstance();
  // null = picker fechado; a lista é recalculada na abertura, não a cada render.
  const [refTargets, setRefTargets] = useState<CrossRefTarget[] | null>(null);

  const s = useEditorState({
    editor,
    selector: ({ editor }) => ({
      inTable: editor.isActive("table"),
      link: editor.isActive("link"),
      codeBlock: editor.isActive("codeBlock"),
    }),
  });

  const chain = () => editor.chain().focus();

  const setLink = () => {
    const prev = editor.getAttributes("link").href ?? "https://";
    const url = window.prompt("URL do link (vazio para remover):", prev);
    if (url === null) return;
    if (url === "") chain().unsetLink().run();
    else chain().extendMarkRange("link").setLink({ href: url }).run();
  };

  return (
    <div className="ribbon-body">
      <div className="tb-group">
        <Btn
          onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
          title="Inserir tabela 3×3"
          wide
        >
          ▦ Tabela
        </Btn>
        <Btn onClick={() => chain().addRowAfter().run()} disabled={!s.inTable} title="Adicionar linha">+Lin</Btn>
        <Btn onClick={() => chain().addColumnAfter().run()} disabled={!s.inTable} title="Adicionar coluna">+Col</Btn>
        <Btn onClick={() => chain().deleteRow().run()} disabled={!s.inTable} title="Remover linha">−Lin</Btn>
        <Btn onClick={() => chain().deleteColumn().run()} disabled={!s.inTable} title="Remover coluna">−Col</Btn>
        <Btn onClick={() => chain().deleteTable().run()} disabled={!s.inTable} title="Excluir tabela">✕Tab</Btn>
      </div>
      <div className="tb-sep" />

      <div className="tb-group">
        <Btn onClick={onInsertImage} title="Inserir imagem" wide>🖼 Imagem</Btn>
        <Btn onClick={setLink} active={s.link} title="Inserir/editar link" wide>🔗 Link</Btn>
        <Btn onClick={() => chain().setHorizontalRule().run()} title="Linha divisória" wide>— Linha</Btn>
        <Btn onClick={() => chain().setPageBreak().run()} title="Quebra de página (nova página no PDF)" wide>⤓ Quebra</Btn>
        <Btn onClick={() => chain().addFootnote().run()} title="Nota de rodapé (Ctrl+Alt+F)" wide>⁺ Nota</Btn>
        <Btn onClick={() => chain().insertMath().run()} title='Equação LaTeX (ou digite "$x$" no texto)' wide>√x Equação</Btn>
        <Btn onClick={() => chain().insertCaption().run()} title="Legenda numerada para a figura/tabela selecionada" wide>🏷 Legenda</Btn>
        <Btn onClick={() => chain().insertTableOfContents().run()} title="Sumário (índice dos títulos, com páginas no PDF)" wide>☰ Sumário</Btn>
        <Btn onClick={() => chain().insertTableOfContents("figures").run()} title="Lista de figuras (com páginas no PDF)" wide>🖼☰ L.Fig</Btn>
        <Btn onClick={() => chain().insertTableOfContents("tables").run()} title="Lista de tabelas (com páginas no PDF)" wide>▦☰ L.Tab</Btn>
        <Btn
          onClick={() => setRefTargets(listCrossRefTargets(editor.state.doc))}
          title="Referência cruzada a título, figura ou tabela"
          wide
        >
          ↪ Ref.
        </Btn>
        <Btn onClick={() => chain().insertContent("[@").run()} title='Citação bibliográfica (ou digite "[@")' wide>❞ Citação</Btn>
        <Btn onClick={() => chain().insertBibliography().run()} title="Lista de referências das obras citadas" wide>📚 Refs</Btn>
        <Btn onClick={() => chain().toggleCodeBlock().run()} active={s.codeBlock} title="Bloco de código" wide>{"{ } Código"}</Btn>
      </div>

      {refTargets && (
        <Modal
          title="Inserir referência cruzada"
          onClose={() => setRefTargets(null)}
          boxStyle={{ maxHeight: "60vh" }}
        >
          <div className="modal-body">
            {refTargets.length === 0 && (
              <p className="crossref-picker-empty">
                Nenhum alvo disponível — crie títulos ou legendas de figura/tabela primeiro.
              </p>
            )}
            {refTargets.map((t) => (
              <button
                key={t.pos}
                className="crossref-target"
                onClick={() => {
                  chain().insertCrossRef(t.pos).run();
                  setRefTargets(null);
                }}
              >
                <strong>{t.label}</strong>
                <span>{t.text || "(sem texto)"}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
