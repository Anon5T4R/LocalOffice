import { useEffect, useState } from "react";
import type { Mark } from "@tiptap/pm/model";
import { useEditorState } from "@tiptap/react";
import { useEditorInstance } from "../../state/EditorContext";
import { useSettings } from "../../state/SettingsContext";
import { Btn } from "./Btn";
import { CASE_FNS, buildFontList, transformCase } from "./shared";

/** "Início": undo/redo, blocos, fonte, marcas, cores, alinhamento, listas, caixa. */
export function HomeTab() {
  const editor = useEditorInstance();
  const { settings, systemFonts, importFont } = useSettings();
  const [painterMarks, setPainterMarks] = useState<readonly Mark[] | null>(null);

  // Format painter: after capturing marks, the next non-empty selection gets them.
  useEffect(() => {
    if (!painterMarks) return;
    const apply = () => {
      const sel = editor.state.selection;
      if (sel.empty) return;
      const chain = editor.chain().focus().unsetAllMarks();
      painterMarks.forEach((m) => chain.setMark(m.type.name, m.attrs));
      chain.run();
      setPainterMarks(null);
    };
    editor.on("selectionUpdate", apply);
    return () => { editor.off("selectionUpdate", apply); };
  }, [editor, painterMarks]);

  const copyFormat = () => {
    const sel = editor.state.selection;
    const marks = sel.empty ? sel.$from.marks() : sel.$from.marksAcross(sel.$to) ?? sel.$from.marks();
    setPainterMarks(marks);
  };

  const s = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor.isActive("bold"),
      italic: editor.isActive("italic"),
      underline: editor.isActive("underline"),
      strike: editor.isActive("strike"),
      subscript: editor.isActive("subscript"),
      superscript: editor.isActive("superscript"),
      code: editor.isActive("code"),
      h1: editor.isActive("heading", { level: 1 }),
      h2: editor.isActive("heading", { level: 2 }),
      h3: editor.isActive("heading", { level: 3 }),
      paragraph: editor.isActive("paragraph"),
      bullet: editor.isActive("bulletList"),
      ordered: editor.isActive("orderedList"),
      task: editor.isActive("taskList"),
      quote: editor.isActive("blockquote"),
      fontFamily: editor.getAttributes("textStyle").fontFamily,
      fontSize: editor.getAttributes("textStyle").fontSize,
      color: editor.getAttributes("textStyle").color,
      highlightColor: editor.getAttributes("highlight").color,
      alignLeft: editor.isActive({ textAlign: "left" }),
      alignCenter: editor.isActive({ textAlign: "center" }),
      alignRight: editor.isActive({ textAlign: "right" }),
      alignJustify: editor.isActive({ textAlign: "justify" }),
      canUndo: editor.can().undo(),
      canRedo: editor.can().redo(),
    }),
  });

  const chain = () => editor.chain().focus();
  const allFonts = buildFontList(settings.customFonts || [], systemFonts);

  return (
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
        <select
          className="tb-btn tb-select"
          value={s.fontFamily || ""}
          onChange={(e) => {
            if (e.target.value) chain().setFontFamily(e.target.value).run();
          }}
          title="Fonte"
        >
          <option value="">Fonte</option>
          {allFonts.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
        <Btn onClick={() => chain().unsetFontFamily().run()} title="Fonte padrão" disabled={!s.fontFamily}>↺</Btn>
        <Btn onClick={importFont} title="Importar fonte">+F</Btn>
      </div>
      <div className="tb-group">
        <div className="tb-size-wrap">
          <input
            className="tb-size-input"
            type="number"
            min={1}
            max={999}
            value={s.fontSize ? parseInt(s.fontSize).toString() : ""}
            placeholder="Tam."
            onChange={(e) => {
              const v = e.target.value;
              if (v) chain().setFontSize(v + "px").run();
            }}
            title="Tamanho da fonte (digite um valor ou selecione)"
            list="font-sizes"
          />
          <datalist id="font-sizes">
            {[8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 28, 36, 48, 72].map((size) => (
              <option key={size} value={size} />
            ))}
          </datalist>
        </div>
        <Btn onClick={() => chain().unsetFontSize().run()} title="Tamanho padrão" disabled={!s.fontSize}>↺</Btn>
      </div>
      <div className="tb-sep" />

      <div className="tb-group">
        <Btn onClick={() => chain().toggleBold().run()} active={s.bold} title="Negrito (Ctrl+B)"><b>B</b></Btn>
        <Btn onClick={() => chain().toggleItalic().run()} active={s.italic} title="Itálico (Ctrl+I)"><i>I</i></Btn>
        <Btn onClick={() => chain().toggleUnderline().run()} active={s.underline} title="Sublinhado (Ctrl+U)"><u>U</u></Btn>
        <Btn onClick={() => chain().toggleStrike().run()} active={s.strike} title="Riscado"><s>S</s></Btn>
        <Btn onClick={() => chain().toggleSuperscript().run()} active={s.superscript} title="Sobrescrito (Ctrl+.)">x<sup>2</sup></Btn>
        <Btn onClick={() => chain().toggleSubscript().run()} active={s.subscript} title="Subscrito (Ctrl+,)">x<sub>2</sub></Btn>
        <Btn onClick={() => chain().toggleCode().run()} active={s.code} title="Código inline">{"</>"}</Btn>
      </div>
      <div className="tb-sep" />

      <div className="tb-group">
        <label className="tb-btn tb-color" title="Cor do realce">
          <svg viewBox="0 0 20 20" width="16" height="16" fill="none">
            <path d="M4 16l-2 3 3-2 9-9-2-2-8 8z" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M12 6l2 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            <line x1="2" y1="18" x2="18" y2="18" stroke={s.highlightColor || "#fde68a"} strokeWidth="3" strokeLinecap="round"/>
          </svg>
          <input
            type="color"
            value={s.highlightColor || "#fde68a"}
            onChange={(e) => chain().toggleHighlight({ color: e.target.value }).run()}
            onMouseDown={(e) => e.stopPropagation()}
          />
        </label>
        <label className="tb-btn tb-color" title="Cor do texto">
          <svg viewBox="0 0 20 20" width="16" height="16" fill="none">
            <text x="10" y="15" textAnchor="middle" fontSize="14" fontWeight="bold" fill="currentColor">A</text>
            <line x1="3" y1="18" x2="17" y2="18" stroke={s.color || "#666"} strokeWidth="2.5" strokeLinecap="round"/>
          </svg>
          <input
            type="color"
            value={s.color || "#000000"}
            onChange={(e) => chain().setColor(e.target.value).run()}
            onMouseDown={(e) => e.stopPropagation()}
          />
        </label>
        <Btn onClick={() => chain().unsetColor().run()} title="Remover cor">
          <svg viewBox="0 0 20 20" width="16" height="16" fill="none">
            <text x="10" y="15" textAnchor="middle" fontSize="14" fontWeight="bold" fill="currentColor">A</text>
            <line x1="3" y1="18" x2="17" y2="18" stroke="#666" strokeWidth="2.5" strokeLinecap="round"/>
            <line x1="4" y1="4" x2="16" y2="16" stroke="#ef4444" strokeWidth="1.5"/>
          </svg>
        </Btn>
      </div>
      <div className="tb-sep" />

      <div className="tb-group">
        <Btn onClick={() => chain().setTextAlign("left").run()} active={s.alignLeft} title="Alinhar à esquerda">⬅</Btn>
        <Btn onClick={() => chain().setTextAlign("center").run()} active={s.alignCenter} title="Centralizar">⬌</Btn>
        <Btn onClick={() => chain().setTextAlign("right").run()} active={s.alignRight} title="Alinhar à direita">➡</Btn>
        <Btn onClick={() => chain().setTextAlign("justify").run()} active={s.alignJustify} title="Justificar">☰</Btn>
        <Btn onClick={() => chain().changeIndent(-1).run()} title="Diminuir recuo (Ctrl+[)">⇤</Btn>
        <Btn onClick={() => chain().changeIndent(1).run()} title="Aumentar recuo (Ctrl+]) — 4cm = citação longa ABNT">⇥</Btn>
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
        <select
          className="tb-btn tb-select"
          value=""
          onChange={(e) => {
            const fn = CASE_FNS[e.target.value];
            if (fn) transformCase(editor, fn);
            e.target.value = "";
          }}
          title="Alterar maiúsculas/minúsculas da seleção"
        >
          <option value="">Aa ▾</option>
          <option value="upper">MAIÚSCULAS</option>
          <option value="lower">minúsculas</option>
          <option value="title">Iniciais Maiúsculas</option>
        </select>
        <Btn onClick={copyFormat} active={!!painterMarks} title="Pincel de formatação (copie o formato e selecione o destino)">🖌</Btn>
        <Btn onClick={() => chain().unsetAllMarks().clearNodes().run()} title="Limpar formatação">⌫ Limpar</Btn>
      </div>
    </div>
  );
}
