import { useState } from "react";
import { Editor, useEditorState } from "@tiptap/react";

interface RibbonProps {
  editor: Editor;
  onInsertImage: () => void;
}

function Btn({
  onClick,
  active,
  disabled,
  title,
  children,
  wide,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      className={"tb-btn" + (active ? " is-active" : "") + (wide ? " tb-wide" : "")}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </button>
  );
}

export function Ribbon({ editor, onInsertImage }: RibbonProps) {
  const [tab, setTab] = useState<"inicio" | "inserir">("inicio");

  const s = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor.isActive("bold"),
      italic: editor.isActive("italic"),
      underline: editor.isActive("underline"),
      strike: editor.isActive("strike"),
      code: editor.isActive("code"),
      h1: editor.isActive("heading", { level: 1 }),
      h2: editor.isActive("heading", { level: 2 }),
      h3: editor.isActive("heading", { level: 3 }),
      paragraph: editor.isActive("paragraph"),
      bullet: editor.isActive("bulletList"),
      ordered: editor.isActive("orderedList"),
      task: editor.isActive("taskList"),
      quote: editor.isActive("blockquote"),
      codeBlock: editor.isActive("codeBlock"),
      link: editor.isActive("link"),
      highlight: editor.isActive("highlight"),
      alignLeft: editor.isActive({ textAlign: "left" }),
      alignCenter: editor.isActive({ textAlign: "center" }),
      alignRight: editor.isActive({ textAlign: "right" }),
      alignJustify: editor.isActive({ textAlign: "justify" }),
      inTable: editor.isActive("table"),
      canUndo: editor.can().undo(),
      canRedo: editor.can().redo(),
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
    <div className="ribbon">
      <div className="ribbon-tabs">
        <button className={"ribbon-tab" + (tab === "inicio" ? " is-active" : "")} onClick={() => setTab("inicio")}>
          Início
        </button>
        <button className={"ribbon-tab" + (tab === "inserir" ? " is-active" : "")} onClick={() => setTab("inserir")}>
          Inserir
        </button>
      </div>

      {tab === "inicio" && (
        <div className="ribbon-body">
          <div className="tb-group">
            <Btn onClick={() => chain().undo().run()} disabled={!s.canUndo} title="Desfazer (Ctrl+Z)">↶</Btn>
            <Btn onClick={() => chain().redo().run()} disabled={!s.canRedo} title="Refazer (Ctrl+Y)">↷</Btn>
          </div>
          <div className="tb-sep" />

          <div className="tb-group">
            <Btn onClick={() => chain().setParagraph().run()} active={s.paragraph} title="Texto normal">¶</Btn>
            <Btn onClick={() => chain().toggleHeading({ level: 1 }).run()} active={s.h1} title="Título 1">H1</Btn>
            <Btn onClick={() => chain().toggleHeading({ level: 2 }).run()} active={s.h2} title="Título 2">H2</Btn>
            <Btn onClick={() => chain().toggleHeading({ level: 3 }).run()} active={s.h3} title="Título 3">H3</Btn>
          </div>
          <div className="tb-sep" />

          <div className="tb-group">
            <Btn onClick={() => chain().toggleBold().run()} active={s.bold} title="Negrito (Ctrl+B)"><b>B</b></Btn>
            <Btn onClick={() => chain().toggleItalic().run()} active={s.italic} title="Itálico (Ctrl+I)"><i>I</i></Btn>
            <Btn onClick={() => chain().toggleUnderline().run()} active={s.underline} title="Sublinhado (Ctrl+U)"><u>U</u></Btn>
            <Btn onClick={() => chain().toggleStrike().run()} active={s.strike} title="Riscado"><s>S</s></Btn>
            <Btn onClick={() => chain().toggleCode().run()} active={s.code} title="Código inline">{"</>"}</Btn>
          </div>
          <div className="tb-sep" />

          <div className="tb-group">
            <Btn onClick={() => chain().toggleHighlight().run()} active={s.highlight} title="Realçar">🖍</Btn>
            <label className="tb-btn tb-color" title="Cor do texto">
              A
              <input
                type="color"
                onChange={(e) => chain().setColor(e.target.value).run()}
                onMouseDown={(e) => e.stopPropagation()}
              />
            </label>
            <Btn onClick={() => chain().unsetColor().run()} title="Remover cor">A̶</Btn>
          </div>
          <div className="tb-sep" />

          <div className="tb-group">
            <Btn onClick={() => chain().setTextAlign("left").run()} active={s.alignLeft} title="Alinhar à esquerda">⬅</Btn>
            <Btn onClick={() => chain().setTextAlign("center").run()} active={s.alignCenter} title="Centralizar">⬌</Btn>
            <Btn onClick={() => chain().setTextAlign("right").run()} active={s.alignRight} title="Alinhar à direita">➡</Btn>
            <Btn onClick={() => chain().setTextAlign("justify").run()} active={s.alignJustify} title="Justificar">☰</Btn>
          </div>
          <div className="tb-sep" />

          <div className="tb-group">
            <Btn onClick={() => chain().toggleBulletList().run()} active={s.bullet} title="Lista com marcadores">• Lista</Btn>
            <Btn onClick={() => chain().toggleOrderedList().run()} active={s.ordered} title="Lista numerada">1. Lista</Btn>
            <Btn onClick={() => chain().toggleTaskList().run()} active={s.task} title="Lista de tarefas">☑</Btn>
            <Btn onClick={() => chain().toggleBlockquote().run()} active={s.quote} title="Citação">❝</Btn>
          </div>
          <div className="tb-sep" />

          <div className="tb-group">
            <Btn onClick={() => chain().unsetAllMarks().clearNodes().run()} title="Limpar formatação">⌫ Limpar</Btn>
          </div>
        </div>
      )}

      {tab === "inserir" && (
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
            <Btn onClick={() => chain().toggleCodeBlock().run()} active={s.codeBlock} title="Bloco de código" wide>{"{ } Código"}</Btn>
          </div>
        </div>
      )}
    </div>
  );
}
