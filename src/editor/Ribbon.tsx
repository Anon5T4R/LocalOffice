import { useEffect, useState } from "react";
import type { Mark } from "@tiptap/pm/model";
import { Editor, useEditorState } from "@tiptap/react";
import { PageFormat, PageMargins } from "../lib/settings";
import { TEMPLATES, DocTemplate } from "../lib/templates";
import { useSettings } from "../state/SettingsContext";

/** Rewrite the case of the current selection's text, preserving each run's marks. */
function transformCase(editor: Editor, fn: (s: string) => string): void {
  const { state } = editor;
  const { from, to, empty } = state.selection;
  if (empty) return;
  const { tr, schema, doc } = state;
  const jobs: { start: number; end: number; text: ReturnType<typeof schema.text> }[] = [];
  doc.nodesBetween(from, to, (node, pos) => {
    if (!node.isText || node.text == null) return;
    const start = Math.max(pos, from);
    const end = Math.min(pos + node.text.length, to);
    if (start >= end) return;
    const slice = node.text.slice(start - pos, end - pos);
    const next = fn(slice);
    if (next !== slice) jobs.push({ start, end, text: schema.text(next, node.marks) });
  });
  // Apply back-to-front so earlier positions stay valid.
  for (let i = jobs.length - 1; i >= 0; i--) tr.replaceWith(jobs[i].start, jobs[i].end, jobs[i].text);
  if (tr.docChanged) editor.view.dispatch(tr);
  editor.commands.focus();
}

const CASE_FNS: Record<string, (s: string) => string> = {
  upper: (s) => s.toLocaleUpperCase(),
  lower: (s) => s.toLocaleLowerCase(),
  title: (s) => s.toLocaleLowerCase().replace(/(^|\s|[-–—])(\S)/g, (_, sep, c) => sep + c.toLocaleUpperCase()),
};

interface RibbonProps {
  editor: Editor;
  onInsertImage: () => void;
  onApplyTemplate: (tmpl: DocTemplate) => void;
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

const MARGIN_PRESETS: Record<string, PageMargins> = {
  normal: { top: 56, bottom: 56, left: 72, right: 72 },
  narrow: { top: 36, bottom: 36, left: 36, right: 36 },
  moderate: { top: 48, bottom: 48, left: 60, right: 60 },
  wide: { top: 72, bottom: 72, left: 96, right: 96 },
};

function marginsEqual(a: PageMargins, b: PageMargins) {
  return a.top === b.top && a.bottom === b.bottom && a.left === b.left && a.right === b.right;
}

function currentMarginPreset(m: PageMargins): string {
  for (const [key, val] of Object.entries(MARGIN_PRESETS)) {
    if (marginsEqual(m, val)) return key;
  }
  return "personalizado";
}

export function Ribbon({ editor, onInsertImage, onApplyTemplate }: RibbonProps) {
  const { settings, updateSettings, systemFonts, importFont } = useSettings();
  const pageFormat = settings.pageFormat || "classic";
  const pageMargins: PageMargins = settings.pageMargins || MARGIN_PRESETS.normal;
  const customFonts = settings.customFonts || [];
  const numberHeadings = settings.numberHeadings === true;

  const [tab, setTab] = useState<"inicio" | "inserir" | "layout">("inicio");
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
      codeBlock: editor.isActive("codeBlock"),
      link: editor.isActive("link"),
      fontFamily: editor.getAttributes("textStyle").fontFamily,
      fontSize: editor.getAttributes("textStyle").fontSize,
      color: editor.getAttributes("textStyle").color,
      highlight: editor.isActive("highlight"),
      highlightColor: editor.getAttributes("highlight").color,
      letterSpacing: editor.getAttributes("textStyle").letterSpacing,
      lineHeight:
        editor.getAttributes("paragraph").lineHeight ||
        editor.getAttributes("heading").lineHeight || "",
      textIndent:
        editor.getAttributes("paragraph").textIndent ||
        editor.getAttributes("heading").textIndent || "",
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

  const allFonts = [
    ...customFonts.map((f) => f.name),
    "Sans-serif",
    "Serif",
    "Monospace",
    "Arial",
    "Times New Roman",
    "Courier New",
    "Georgia",
    "Verdana",
    ...systemFonts,
  ];

  return (
    <div className="ribbon">
      <div className="ribbon-tabs">
        <button className={"ribbon-tab" + (tab === "inicio" ? " is-active" : "")} onClick={() => setTab("inicio")}>
          Início
        </button>
        <button className={"ribbon-tab" + (tab === "inserir" ? " is-active" : "")} onClick={() => setTab("inserir")}>
          Inserir
        </button>
        <button className={"ribbon-tab" + (tab === "layout" ? " is-active" : "")} onClick={() => setTab("layout")}>
          Layout
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
                {[8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 28, 36, 48, 72].map((s) => (
                  <option key={s} value={s} />
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
            <Btn onClick={() => chain().addFootnote().run()} title="Nota de rodapé (Ctrl+Alt+F)" wide>⁺ Nota</Btn>
            <Btn onClick={() => chain().insertTableOfContents().run()} title="Sumário (índice dos títulos, com páginas no PDF)" wide>☰ Sumário</Btn>
            <Btn onClick={() => chain().insertContent("[@").run()} title='Citação bibliográfica (ou digite "[@")' wide>❞ Citação</Btn>
            <Btn onClick={() => chain().insertBibliography().run()} title="Lista de referências das obras citadas" wide>📚 Refs</Btn>
            <Btn onClick={() => chain().toggleCodeBlock().run()} active={s.codeBlock} title="Bloco de código" wide>{"{ } Código"}</Btn>
          </div>
        </div>
      )}

      {tab === "layout" && (
        <div className="ribbon-body">
          <div className="tb-group">
            <select
              className="tb-btn tb-select"
              defaultValue=""
              onChange={(e) => {
                const t = TEMPLATES[e.target.value];
                if (t) onApplyTemplate(t);
                e.target.value = "";
              }}
              title="Modelo de documento pré-configurado"
              style={{ minWidth: 120 }}
            >
              <option value="">Modelos ▾</option>
              {Object.entries(TEMPLATES).map(([key, t]) => (
                <option key={key} value={key} title={t.description}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="tb-sep" />

          <div className="tb-group">
            <select
              className="tb-btn tb-select"
              value={pageFormat}
              onChange={(e) => updateSettings({ pageFormat: e.target.value as PageFormat })}
              title="Formato de página"
            >
              <option value="classic">Clássica (infinito)</option>
              <option value="a4">A4 (210×297mm)</option>
              <option value="a5">A5 (148×210mm)</option>
              <option value="letter">Carta (216×279mm)</option>
              <option value="a3">A3 (297×420mm)</option>
            </select>
          </div>
          <div className="tb-sep" />

          <div className="tb-group">
            <select
              className="tb-btn tb-select"
              value={currentMarginPreset(pageMargins)}
              onChange={(e) => {
                const preset = MARGIN_PRESETS[e.target.value];
                if (preset) updateSettings({ pageMargins: preset });
              }}
              title="Margens da página"
            >
              <option value="normal">Margens normais</option>
              <option value="narrow">Estreitas</option>
              <option value="moderate">Moderadas</option>
              <option value="wide">Amplas</option>
              <option value="personalizado" disabled>Personalizado</option>
            </select>
          </div>
          <div className="tb-sep" />

          <div className="tb-group">
            <select
              className="tb-btn tb-select"
              value={s.lineHeight}
              onChange={(e) => {
                if (e.target.value) chain().setLineHeight(e.target.value).run();
              }}
              title="Espaçamento entre linhas"
            >
              <option value="">Esp. linhas</option>
              <option value="1.0">Simples</option>
              <option value="1.15">1.15</option>
              <option value="1.5">1.5</option>
              <option value="2.0">Duplo</option>
              <option value="2.5">2.5</option>
              <option value="3.0">Triplo</option>
            </select>
            <Btn onClick={() => chain().unsetLineHeight().run()} title="Espaçamento padrão" disabled={!s.lineHeight}>↺</Btn>
          </div>
          <div className="tb-sep" />

          <div className="tb-group">
            <select
              className="tb-btn tb-select"
              value={s.letterSpacing ? s.letterSpacing.replace("px", "") : ""}
              onChange={(e) => {
                if (e.target.value) chain().setLetterSpacing(e.target.value + "px").run();
                else chain().unsetLetterSpacing().run();
              }}
              title="Espaçamento entre letras"
            >
              <option value="">Esp. letras</option>
              <option value="0">Normal</option>
              <option value="0.5">0.5px</option>
              <option value="1">1px</option>
              <option value="1.5">1.5px</option>
              <option value="2">2px</option>
              <option value="3">3px</option>
              <option value="4">4px</option>
            </select>
            <Btn onClick={() => chain().unsetLetterSpacing().run()} title="Espaçamento padrão" disabled={!s.letterSpacing}>↺</Btn>
          </div>
          <div className="tb-sep" />

          <div className="tb-group">
            <select
              className="tb-btn tb-select"
              value={s.textIndent}
              onChange={(e) => chain().setTextIndent(e.target.value || null).run()}
              title="Recuo da primeira linha do parágrafo"
            >
              <option value="">Recuo 1ª linha</option>
              <option value="1.25cm">1,25 cm (ABNT)</option>
              <option value="2cm">2 cm</option>
            </select>
          </div>
          <div className="tb-sep" />

          <div className="tb-group">
            <Btn
              onClick={() => updateSettings({ numberHeadings: !numberHeadings })}
              active={numberHeadings}
              title="Numerar títulos automaticamente (1, 1.1, 1.1.1…)"
              wide
            >
              1.2.3 Títulos
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}
