import { useState } from "react";
import { useEditorState } from "@tiptap/react";
import { useEditorInstance } from "../../state/EditorContext";
import { useSettings } from "../../state/SettingsContext";
import type { PageFormat } from "../../lib/settings";
import { TEMPLATES, templateName, templateDesc, type DocTemplate } from "../../lib/templates";
import { effectiveLayout, patchDocLayout } from "../DocLayout";
import { StylesModal } from "../StylesModal";
import { HeaderFooterModal } from "../HeaderFooterModal";
import { Btn } from "./Btn";
import { MARGIN_PRESETS, currentMarginPreset } from "./shared";
import { t as tr } from "../../lib/i18n";

/** "Layout": modelos, formato de página, margens, espaçamentos, numeração. */
export function LayoutTab({ onApplyTemplate }: { onApplyTemplate: (tmpl: DocTemplate) => void }) {
  const editor = useEditorInstance();
  const { settings } = useSettings();
  const [showStyles, setShowStyles] = useState(false);
  const [showHeaderFooter, setShowHeaderFooter] = useState(false);
  const { pageFormat, pageMargins, numberHeadings, styles } = effectiveLayout(editor.state.doc, settings);

  const s = useEditorState({
    editor,
    selector: ({ editor }) => ({
      letterSpacing: editor.getAttributes("textStyle").letterSpacing,
      lineHeight:
        editor.getAttributes("paragraph").lineHeight ||
        editor.getAttributes("heading").lineHeight || "",
      textIndent:
        editor.getAttributes("paragraph").textIndent ||
        editor.getAttributes("heading").textIndent || "",
    }),
  });

  const chain = () => editor.chain().focus();

  return (
    <div className="ribbon-body">
      <div className="tb-group">
        <select
          className="tb-btn tb-select"
          defaultValue=""
          onChange={(e) => {
            const tmpl = TEMPLATES[e.target.value];
            if (tmpl) onApplyTemplate(tmpl);
            e.target.value = "";
          }}
          title={tr("layout.templateTitle")}
          style={{ minWidth: 120 }}
        >
          <option value="">{tr("layout.templatesMenu")}</option>
          {Object.keys(TEMPLATES).map((key) => (
            <option key={key} value={key} title={templateDesc(key)}>{templateName(key)}</option>
          ))}
        </select>
      </div>
      <div className="tb-sep" />

      <div className="tb-group">
        <select
          className="tb-btn tb-select"
          value={pageFormat}
          onChange={(e) => patchDocLayout(editor, settings, { pageFormat: e.target.value as PageFormat })}
          title={tr("layout.pageFormatTitle")}
        >
          <option value="classic">{tr("layout.fmtClassic")}</option>
          <option value="a4">{tr("layout.fmtA4")}</option>
          <option value="a5">{tr("layout.fmtA5")}</option>
          <option value="letter">{tr("layout.fmtLetter")}</option>
          <option value="a3">{tr("layout.fmtA3")}</option>
        </select>
      </div>
      <div className="tb-sep" />

      <div className="tb-group">
        <select
          className="tb-btn tb-select"
          value={currentMarginPreset(pageMargins)}
          onChange={(e) => {
            const preset = MARGIN_PRESETS[e.target.value];
            if (preset) patchDocLayout(editor, settings, { pageMargins: preset });
          }}
          title={tr("layout.marginsTitle")}
        >
          <option value="normal">{tr("layout.marginNormal")}</option>
          <option value="narrow">{tr("layout.marginNarrow")}</option>
          <option value="moderate">{tr("layout.marginModerate")}</option>
          <option value="wide">{tr("layout.marginWide")}</option>
          <option value="personalizado" disabled>{tr("layout.marginCustom")}</option>
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
          title={tr("layout.lineHeightTitle")}
        >
          <option value="">{tr("layout.lineHeightMenu")}</option>
          <option value="1.0">{tr("layout.lineSingle")}</option>
          <option value="1.15">1.15</option>
          <option value="1.5">1.5</option>
          <option value="2.0">{tr("layout.lineDouble")}</option>
          <option value="2.5">2.5</option>
          <option value="3.0">{tr("layout.lineTriple")}</option>
        </select>
        <Btn onClick={() => chain().unsetLineHeight().run()} title={tr("layout.lineHeightDefault")} disabled={!s.lineHeight}>↺</Btn>
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
          title={tr("layout.letterSpacingTitle")}
        >
          <option value="">{tr("layout.letterSpacingMenu")}</option>
          <option value="0">{tr("layout.letterNormal")}</option>
          <option value="0.5">0.5px</option>
          <option value="1">1px</option>
          <option value="1.5">1.5px</option>
          <option value="2">2px</option>
          <option value="3">3px</option>
          <option value="4">4px</option>
        </select>
        <Btn onClick={() => chain().unsetLetterSpacing().run()} title={tr("layout.letterSpacingDefault")} disabled={!s.letterSpacing}>↺</Btn>
      </div>
      <div className="tb-sep" />

      <div className="tb-group">
        <select
          className="tb-btn tb-select"
          value={s.textIndent}
          onChange={(e) => chain().setTextIndent(e.target.value || null).run()}
          title={tr("layout.indentTitle")}
        >
          <option value="">{tr("layout.indentMenu")}</option>
          <option value="1.25cm">{tr("layout.indentABNT")}</option>
          <option value="2cm">{tr("layout.indent2")}</option>
        </select>
      </div>
      <div className="tb-sep" />

      <div className="tb-group">
        <Btn
          onClick={() => patchDocLayout(editor, settings, { numberHeadings: !numberHeadings })}
          active={numberHeadings}
          title={tr("layout.numberHeadings")}
          wide
        >
          {tr("layout.numberHeadingsLabel")}
        </Btn>
      </div>
      <div className="tb-sep" />

      <div className="tb-group">
        <Btn
          onClick={() => setShowHeaderFooter(true)}
          title={tr("layout.headerFooter")}
          wide
        >
          {tr("layout.headerFooterLabel")}
        </Btn>
        <Btn
          onClick={() => setShowStyles(true)}
          active={!!styles && Object.keys(styles).length > 0}
          title={tr("layout.styles")}
          wide
        >
          {tr("layout.stylesLabel")}
        </Btn>
      </div>
      {showStyles && <StylesModal onClose={() => setShowStyles(false)} />}
      {showHeaderFooter && <HeaderFooterModal onClose={() => setShowHeaderFooter(false)} />}
    </div>
  );
}
