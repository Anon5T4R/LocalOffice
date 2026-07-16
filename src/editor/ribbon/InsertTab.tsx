import { useState } from "react";
import { useEditorState } from "@tiptap/react";
import { useEditorInstance } from "../../state/EditorContext";
import { Modal } from "../../components/Modal";
import { listCrossRefTargets, type CrossRefTarget } from "../CrossRef";
import { HeaderFooterModal } from "../HeaderFooterModal";
import { Btn } from "./Btn";
import { t as tr } from "../../lib/i18n";

/** "Inserir": tabelas, imagem, link, quebras, notas, sumário, citações. */
export function InsertTab({ onInsertImage }: { onInsertImage: () => void }) {
  const editor = useEditorInstance();
  // null = picker fechado; a lista é recalculada na abertura, não a cada render.
  const [refTargets, setRefTargets] = useState<CrossRefTarget[] | null>(null);
  const [showHeaderFooter, setShowHeaderFooter] = useState(false);

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
    const url = window.prompt(tr("insert.linkPrompt"), prev);
    if (url === null) return;
    if (url === "") chain().unsetLink().run();
    else chain().extendMarkRange("link").setLink({ href: url }).run();
  };

  return (
    <div className="ribbon-body">
      <div className="tb-group">
        <Btn
          onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
          title={tr("insert.table")}
          wide
        >
          {tr("insert.tableLabel")}
        </Btn>
        <Btn onClick={() => chain().addRowAfter().run()} disabled={!s.inTable} title={tr("insert.addRow")}>+Lin</Btn>
        <Btn onClick={() => chain().addColumnAfter().run()} disabled={!s.inTable} title={tr("insert.addCol")}>+Col</Btn>
        <Btn onClick={() => chain().deleteRow().run()} disabled={!s.inTable} title={tr("insert.delRow")}>−Lin</Btn>
        <Btn onClick={() => chain().deleteColumn().run()} disabled={!s.inTable} title={tr("insert.delCol")}>−Col</Btn>
        <Btn onClick={() => chain().deleteTable().run()} disabled={!s.inTable} title={tr("insert.delTable")}>✕Tab</Btn>
      </div>
      <div className="tb-sep" />

      <div className="tb-group">
        <Btn onClick={onInsertImage} title={tr("insert.image")} wide>{tr("insert.imageLabel")}</Btn>
        <Btn onClick={setLink} active={s.link} title={tr("insert.link")} wide>{tr("insert.linkLabel")}</Btn>
        <Btn onClick={() => chain().setHorizontalRule().run()} title={tr("insert.hr")} wide>{tr("insert.hrLabel")}</Btn>
        <Btn onClick={() => chain().setPageBreak().run()} title={tr("insert.pageBreak")} wide>{tr("insert.pageBreakLabel")}</Btn>
        <Btn
          onClick={() => setShowHeaderFooter(true)}
          title={tr("layout.headerFooter")}
          wide
        >
          {tr("insert.headerLabel")}
        </Btn>
        <Btn onClick={() => chain().addFootnote().run()} title={tr("insert.footnote")} wide>{tr("insert.footnoteLabel")}</Btn>
        <Btn onClick={() => chain().insertMath().run()} title={tr("insert.math")} wide>{tr("insert.mathLabel")}</Btn>
        <Btn onClick={() => chain().insertCaption().run()} title={tr("insert.caption")} wide>{tr("insert.captionLabel")}</Btn>
        <Btn onClick={() => chain().insertTableOfContents().run()} title={tr("insert.toc")} wide>{tr("insert.tocLabel")}</Btn>
        <Btn onClick={() => chain().insertTableOfContents("figures").run()} title={tr("insert.figList")} wide>{tr("insert.figListLabel")}</Btn>
        <Btn onClick={() => chain().insertTableOfContents("tables").run()} title={tr("insert.tabList")} wide>{tr("insert.tabListLabel")}</Btn>
        <Btn
          onClick={() => setRefTargets(listCrossRefTargets(editor.state.doc))}
          title={tr("insert.crossref")}
          wide
        >
          {tr("insert.crossrefLabel")}
        </Btn>
        <Btn onClick={() => chain().insertContent("[@").run()} title={tr("insert.citation")} wide>{tr("insert.citationLabel")}</Btn>
        <Btn onClick={() => chain().insertBibliography().run()} title={tr("insert.refs")} wide>{tr("insert.refsLabel")}</Btn>
        <Btn onClick={() => chain().toggleCodeBlock().run()} active={s.codeBlock} title={tr("insert.codeBlock")} wide>{tr("insert.codeBlockLabel")}</Btn>
      </div>

      {showHeaderFooter && <HeaderFooterModal onClose={() => setShowHeaderFooter(false)} />}
      {refTargets && (
        <Modal
          title={tr("insert.crossrefModalTitle")}
          onClose={() => setRefTargets(null)}
          boxStyle={{ maxHeight: "60vh" }}
        >
          <div className="modal-body">
            {refTargets.length === 0 && (
              <p className="crossref-picker-empty">
                {tr("insert.crossrefEmpty")}
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
                <span>{t.text || tr("insert.crossrefNoText")}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
