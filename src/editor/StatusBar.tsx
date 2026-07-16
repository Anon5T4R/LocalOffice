import { useEffect, useState, useSyncExternalStore } from "react";
import { useEditorState } from "@tiptap/react";
import { estimatePages } from "../lib/pageGeometry";
import { getTabSaveStatus, subscribeTabSaveStatus } from "../lib/saveStatusStore";
import { effectiveLayout } from "./DocLayout";
import { getPageCount } from "./PageBreaks";
import { useSettings } from "../state/SettingsContext";
import { useEditorInstance } from "../state/EditorContext";
import { t as tr, localeTag } from "../lib/i18n";

const WORDS_PER_MINUTE = 200;

function countWords(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

interface StatusBarProps {
  onZoomChange: (z: number) => void;
  activeTabId: string;
}

export function StatusBar({ onZoomChange, activeTabId }: StatusBarProps) {
  const editor = useEditorInstance();
  const { settings } = useSettings();
  // Subscribed directly (instead of a prop threaded through App) so a save
  // transition only re-renders StatusBar, not the whole app tree.
  const saveStatus = useSyncExternalStore(subscribeTabSaveStatus, () => getTabSaveStatus(activeTabId));
  const { pageFormat, pageMargins: margins } = effectiveLayout(editor.state.doc, settings);
  const zoom = settings.zoom || 100;
  const wordGoal = settings.wordGoal || 0;
  const { words, chars, charsNoSpaces, paragraphs, breaks, pageBreakPages, selWords, selChars } = useEditorState({
    editor,
    selector: ({ editor }) => {
      const text = editor.getText();
      let breaks = 0;
      let paragraphs = 0;
      editor.state.doc.descendants((n) => {
        if (n.type.name === "pageBreak") breaks += 1;
        if ((n.type.name === "paragraph" || n.type.name === "heading") && n.textContent.trim()) paragraphs += 1;
      });
      const { from, to, empty } = editor.state.selection;
      const selText = empty ? "" : editor.state.doc.textBetween(from, to, " ");
      return {
        words: countWords(text),
        chars: text.replace(/\n/g, "").length,
        charsNoSpaces: text.replace(/\s/g, "").length,
        paragraphs,
        breaks,
        // Authoritative for paginated formats: the exact count the page-gap
        // decorations were drawn from (editor/PageBreaks.ts, which already
        // accounts for manual breaks). "classic" has no fixed page height,
        // so this is always 1 there -- classic uses heightPages + breaks
        // below instead.
        pageBreakPages: getPageCount(editor.state),
        selWords: countWords(selText),
        selChars: selText.replace(/\n/g, "").length,
      };
    },
  });

  const [heightPages, setHeightPages] = useState(1);
  const zoomFactor = (settings.zoom || 100) / 100;

  useEffect(() => {
    const el = editor.view.dom as HTMLElement;
    // el.scrollHeight is measured inside the ancestor that carries the CSS
    // `zoom` (App.tsx's .pages-container) and scales with it in this
    // WebView — estimatePages compensates so the count doesn't change
    // just because the user zoomed in or out. Only actually used for
    // "classic" (see `pages` below) -- scrollHeight includes the page-gap
    // decorations' own height for paginated formats, which would overcount.
    const measure = () => setHeightPages(estimatePages(el.scrollHeight, pageFormat, margins, zoomFactor));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [editor, pageFormat, margins, zoomFactor]);

  // Classic is free-flow on screen but the PDF still honors manual page
  // breaks (break-after: page), so the estimate can never be below breaks+1.
  const pages = pageFormat === "classic" ? Math.max(heightPages, breaks + 1) : pageBreakPages;
  const readMin = Math.max(1, Math.round(words / WORDS_PER_MINUTE));

  return (
    <div className="status-bar">
      <span title={tr("status.pagesTitle")}>
        ~{pages} {tr(pages === 1 ? "unit.page" : "unit.pages")}
      </span>
      {selWords > 0 ? (
        <span title={tr("status.selection")}>{selWords} {tr("status.of")} {words} {tr(words === 1 ? "unit.word" : "unit.words")} · {selChars} {tr(selChars === 1 ? "unit.char" : "unit.chars")}</span>
      ) : (
        <span title={`${charsNoSpaces} ${tr("status.charsNoSpaces")} · ${paragraphs} ${tr(paragraphs === 1 ? "unit.paragraph" : "unit.paragraphs")}`}>
          {words} {tr(words === 1 ? "unit.word" : "unit.words")} · {chars} {tr(chars === 1 ? "unit.char" : "unit.chars")}
        </span>
      )}
      <span title={tr("status.readTitle")}>{tr("status.readMin", { n: readMin })}</span>
      {saveStatus.kind === "error" && (
        <span className="status-save-error" title={saveStatus.message}>
          {tr("status.saveError")}
        </span>
      )}
      {saveStatus.kind === "saving" && <span className="status-saving">{tr("status.saving")}</span>}
      {saveStatus.kind === "saved" && (
        <span className="status-saved" title={tr("status.savedTitle")}>
          {tr("status.savedAt", { time: new Date(saveStatus.at).toLocaleTimeString(localeTag(), { hour: "2-digit", minute: "2-digit" }) })}
        </span>
      )}
      {wordGoal ? (
        <span
          className={"status-goal" + (words >= wordGoal ? " is-done" : "")}
          title={tr("status.goalTitle", { goal: wordGoal })}
        >
          🎯 {Math.min(100, Math.round((words / wordGoal) * 100))}%
        </span>
      ) : null}
      <span className="status-zoom">
        <button type="button" className="status-zoom-btn" onClick={() => onZoomChange(zoom - 10)} title={tr("status.zoomOut")}>−</button>
        <button type="button" className="status-zoom-val" onClick={() => onZoomChange(100)} title={tr("status.zoomReset")}>{zoom}%</button>
        <button type="button" className="status-zoom-btn" onClick={() => onZoomChange(zoom + 10)} title={tr("status.zoomIn")}>+</button>
      </span>
    </div>
  );
}
