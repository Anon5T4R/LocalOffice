import { useEditorState } from "@tiptap/react";
import { useEditorInstance } from "../../state/EditorContext";
import { useSettings } from "../../state/SettingsContext";
import type { PageFormat } from "../../lib/settings";
import { TEMPLATES, type DocTemplate } from "../../lib/templates";
import { effectiveLayout, patchDocLayout } from "../DocLayout";
import { Btn } from "./Btn";
import { MARGIN_PRESETS, currentMarginPreset } from "./shared";

/** "Layout": modelos, formato de página, margens, espaçamentos, numeração. */
export function LayoutTab({ onApplyTemplate }: { onApplyTemplate: (tmpl: DocTemplate) => void }) {
  const editor = useEditorInstance();
  const { settings } = useSettings();
  const { pageFormat, pageMargins, numberHeadings } = effectiveLayout(editor.state.doc, settings);

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
          onChange={(e) => patchDocLayout(editor, settings, { pageFormat: e.target.value as PageFormat })}
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
            if (preset) patchDocLayout(editor, settings, { pageMargins: preset });
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
          onClick={() => patchDocLayout(editor, settings, { numberHeadings: !numberHeadings })}
          active={numberHeadings}
          title="Numerar títulos automaticamente (1, 1.1, 1.1.1…)"
          wide
        >
          1.2.3 Títulos
        </Btn>
      </div>
    </div>
  );
}
