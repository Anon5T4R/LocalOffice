import { useMemo } from "react";
import { useEditorState } from "@tiptap/react";
import { useEditorInstance } from "../../state/EditorContext";
import { useSettings } from "../../state/SettingsContext";
import { cssSizeToPt, ptToPx } from "../../lib/fontUnits";
import { Btn } from "./Btn";
import { CASE_FNS, buildFontList, transformCase } from "./shared";
import { t } from "../../lib/i18n";

interface HomeTabProps {
  /** Format painter armed state — owned by Ribbon so it survives tab switches. */
  painterActive: boolean;
  onCopyFormat: () => void;
}

/** "Início": undo/redo, blocos, fonte, marcas, cores, alinhamento, listas, caixa. */
export function HomeTab({ painterActive, onCopyFormat }: HomeTabProps) {
  const editor = useEditorInstance();
  const { settings, systemFonts, importFont } = useSettings();

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
  // Only recomputed when the font sets actually change — this list can run
  // into the hundreds with a full system font catalog, and HomeTab
  // re-renders on every selection/formatting change.
  const allFonts = useMemo(
    () => buildFontList(settings.customFonts || [], systemFonts),
    [settings.customFonts, systemFonts]
  );

  return (
    <div className="ribbon-body">
      <div className="tb-group">
        <Btn onClick={() => chain().undo().run()} disabled={!s.canUndo} title={t("home.undo")}>↶</Btn>
        <Btn onClick={() => chain().redo().run()} disabled={!s.canRedo} title={t("home.redo")}>↷</Btn>
      </div>
      <div className="tb-sep" />

      <div className="tb-group">
        <Btn onClick={() => chain().setParagraph().run()} active={s.paragraph} title={t("home.paragraph")}>¶</Btn>
        <Btn onClick={() => chain().toggleHeading({ level: 1 }).run()} active={s.h1} title={t("home.h1")}>H1</Btn>
        <Btn onClick={() => chain().toggleHeading({ level: 2 }).run()} active={s.h2} title={t("home.h2")}>H2</Btn>
        <Btn onClick={() => chain().toggleHeading({ level: 3 }).run()} active={s.h3} title={t("home.h3")}>H3</Btn>
      </div>
      <div className="tb-sep" />

      <div className="tb-group">
        <select
          className="tb-btn tb-select"
          value={s.fontFamily || ""}
          onChange={(e) => {
            if (e.target.value) chain().setFontFamily(e.target.value).run();
          }}
          title={t("home.font")}
        >
          <option value="">{t("home.font")}</option>
          {allFonts.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
        <Btn onClick={() => chain().unsetFontFamily().run()} title={t("home.fontDefault")} disabled={!s.fontFamily}>↺</Btn>
        <Btn onClick={importFont} title={t("home.importFont")}>+F</Btn>
      </div>
      <div className="tb-group">
        <div className="tb-size-wrap">
          <input
            className="tb-size-input"
            type="number"
            min={1}
            max={999}
            step={0.5}
            value={cssSizeToPt(s.fontSize) ?? ""}
            placeholder={t("home.fontSizePlaceholder")}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              // A UI fala pontos (o "12" da ABNT/Word); o mark grava px, a
              // unidade de todo o motor de layout (lib/fontUnits.ts).
              if (!Number.isNaN(v) && v > 0) chain().setFontSize(`${ptToPx(v)}px`).run();
            }}
            title={t("home.fontSizeTitle")}
            list="font-sizes"
          />
          <datalist id="font-sizes">
            {[8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 28, 36, 48, 72].map((size) => (
              <option key={size} value={size} />
            ))}
          </datalist>
        </div>
        <Btn onClick={() => chain().unsetFontSize().run()} title={t("home.fontSizeDefault")} disabled={!s.fontSize}>↺</Btn>
      </div>
      <div className="tb-sep" />

      <div className="tb-group">
        <Btn onClick={() => chain().toggleBold().run()} active={s.bold} title={t("home.bold")}><b>B</b></Btn>
        <Btn onClick={() => chain().toggleItalic().run()} active={s.italic} title={t("home.italic")}><i>I</i></Btn>
        <Btn onClick={() => chain().toggleUnderline().run()} active={s.underline} title={t("home.underline")}><u>U</u></Btn>
        <Btn onClick={() => chain().toggleStrike().run()} active={s.strike} title={t("home.strike")}><s>S</s></Btn>
        <Btn onClick={() => chain().toggleSuperscript().run()} active={s.superscript} title={t("home.superscript")}>x<sup>2</sup></Btn>
        <Btn onClick={() => chain().toggleSubscript().run()} active={s.subscript} title={t("home.subscript")}>x<sub>2</sub></Btn>
        <Btn onClick={() => chain().toggleCode().run()} active={s.code} title={t("home.code")}>{"</>"}</Btn>
      </div>
      <div className="tb-sep" />

      <div className="tb-group">
        <label className="tb-btn tb-color" title={t("home.highlightColor")}>
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
        <label className="tb-btn tb-color" title={t("home.textColor")}>
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
        <Btn onClick={() => chain().unsetColor().run()} title={t("home.removeColor")}>
          <svg viewBox="0 0 20 20" width="16" height="16" fill="none">
            <text x="10" y="15" textAnchor="middle" fontSize="14" fontWeight="bold" fill="currentColor">A</text>
            <line x1="3" y1="18" x2="17" y2="18" stroke="#666" strokeWidth="2.5" strokeLinecap="round"/>
            <line x1="4" y1="4" x2="16" y2="16" stroke="#ef4444" strokeWidth="1.5"/>
          </svg>
        </Btn>
      </div>
      <div className="tb-sep" />

      <div className="tb-group">
        <Btn onClick={() => chain().setTextAlign("left").run()} active={s.alignLeft} title={t("home.alignLeft")}>⬅</Btn>
        <Btn onClick={() => chain().setTextAlign("center").run()} active={s.alignCenter} title={t("home.alignCenter")}>⬌</Btn>
        <Btn onClick={() => chain().setTextAlign("right").run()} active={s.alignRight} title={t("home.alignRight")}>➡</Btn>
        <Btn onClick={() => chain().setTextAlign("justify").run()} active={s.alignJustify} title={t("home.alignJustify")}>☰</Btn>
        <Btn onClick={() => chain().changeIndent(-1).run()} title={t("home.indentDec")}>⇤</Btn>
        <Btn onClick={() => chain().changeIndent(1).run()} title={t("home.indentInc")}>⇥</Btn>
      </div>
      <div className="tb-sep" />

      <div className="tb-group">
        <Btn onClick={() => chain().toggleBulletList().run()} active={s.bullet} title={t("home.bulletTitle")}>{t("home.bulletLabel")}</Btn>
        <Btn onClick={() => chain().toggleOrderedList().run()} active={s.ordered} title={t("home.orderedTitle")}>{t("home.orderedLabel")}</Btn>
        <Btn onClick={() => chain().toggleTaskList().run()} active={s.task} title={t("home.taskTitle")}>☑</Btn>
        <Btn onClick={() => chain().toggleBlockquote().run()} active={s.quote} title={t("home.quoteTitle")}>❝</Btn>
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
          title={t("home.caseTitle")}
        >
          <option value="">{t("home.caseMenu")}</option>
          <option value="upper">{t("home.caseUpper")}</option>
          <option value="lower">{t("home.caseLower")}</option>
          <option value="title">{t("home.caseTitleCase")}</option>
        </select>
        <Btn onClick={onCopyFormat} active={painterActive} title={t("home.painter")}>🖌</Btn>
        <Btn onClick={() => chain().unsetAllMarks().clearNodes().run()} title={t("home.clearTitle")}>{t("home.clearLabel")}</Btn>
      </div>
    </div>
  );
}
