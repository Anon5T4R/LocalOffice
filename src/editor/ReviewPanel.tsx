import { useState } from "react";
import { Editor, useEditorState } from "@tiptap/react";
import { useSettings } from "../state/SettingsContext";
import { useEditorInstance } from "../state/EditorContext";
import { arrayOfObjectsEqual } from "../lib/equality";
import { t, localeTag } from "../lib/i18n";

interface CommentItem {
  id: string;
  text: string;
  author: string;
  ts: number;
  resolved: boolean;
  from: number;
  to: number;
  excerpt: string;
}

interface ChangeItem {
  kind: "insertion" | "deletion";
  author: string;
  from: number;
  to: number;
  excerpt: string;
}

interface ReviewPanelProps {
  onClose: () => void;
}

function collectComments(editor: Editor): CommentItem[] {
  const byId = new Map<string, CommentItem>();
  editor.state.doc.descendants((node, pos) => {
    node.marks.forEach((mark) => {
      if (mark.type.name !== "comment" || !mark.attrs.id) return;
      const existing = byId.get(mark.attrs.id);
      if (existing) {
        existing.to = pos + node.nodeSize;
        existing.excerpt = (existing.excerpt + node.textContent).slice(0, 80);
      } else {
        byId.set(mark.attrs.id, {
          id: mark.attrs.id,
          text: mark.attrs.text,
          author: mark.attrs.author,
          ts: mark.attrs.ts,
          resolved: mark.attrs.resolved === true,
          from: pos,
          to: pos + node.nodeSize,
          excerpt: node.textContent.slice(0, 80),
        });
      }
    });
    return true;
  });
  return [...byId.values()].sort((a, b) => a.from - b.from);
}

function collectChanges(editor: Editor): ChangeItem[] {
  const out: ChangeItem[] = [];
  editor.state.doc.descendants((node, pos) => {
    node.marks.forEach((mark) => {
      if (mark.type.name !== "insertion" && mark.type.name !== "deletion") return;
      const kind = mark.type.name as ChangeItem["kind"];
      const last = out[out.length - 1];
      // Merge adjacent ranges of the same kind/author into one entry.
      if (last && last.kind === kind && last.to === pos && last.author === mark.attrs.author) {
        last.to = pos + node.nodeSize;
        last.excerpt = (last.excerpt + node.textContent).slice(0, 60);
      } else {
        out.push({
          kind,
          author: mark.attrs.author,
          from: pos,
          to: pos + node.nodeSize,
          excerpt: node.textContent.slice(0, 60),
        });
      }
    });
    return true;
  });
  return out;
}

export function ReviewPanel({ onClose }: ReviewPanelProps) {
  const editor = useEditorInstance();
  const { settings, updateSettings } = useSettings();
  const trackChanges = settings.trackChanges === true;
  const authorName = settings.authorName || t("review.authorFallback");
  const [newComment, setNewComment] = useState("");

  const { comments, changes, hasSelection } = useEditorState({
    editor,
    selector: ({ editor }) => ({
      comments: collectComments(editor),
      changes: collectChanges(editor),
      hasSelection: !editor.state.selection.empty,
    }),
    equalityFn: (a, b) =>
      !!b &&
      a.hasSelection === b.hasSelection &&
      arrayOfObjectsEqual(a.comments, b.comments) &&
      arrayOfObjectsEqual(a.changes, b.changes),
  });

  const go = (from: number) => editor.chain().focus().setTextSelection(from).scrollIntoView().run();

  const addComment = () => {
    const text = newComment.trim();
    if (!text) return;
    editor.chain().focus().addComment(text, authorName).run();
    setNewComment("");
  };

  return (
    <aside className="chapters-panel review-panel">
      <div className="panel-header">
        <strong>{t("review.title")}</strong>
        <span className="ai-spacer" />
        <button className="tb-btn" onClick={onClose} title={t("common.closePanel")}>✕</button>
      </div>

      <label className="review-track-toggle" title={t("review.trackToggleTitle")}>
        <input type="checkbox" checked={trackChanges} onChange={() => updateSettings({ trackChanges: !trackChanges })} />
        {t("review.trackToggle")}
      </label>

      <div className="review-section">
        <div className="review-section-title">{t("review.comments")}</div>
        <div className="review-new-comment">
          <textarea
            value={newComment}
            placeholder={hasSelection ? t("review.commentPlaceholderSel") : t("review.commentPlaceholderNone")}
            disabled={!hasSelection}
            rows={2}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                addComment();
              }
            }}
          />
          <button className="tb-btn" disabled={!hasSelection || !newComment.trim()} onClick={addComment}>
            {t("review.comment")}
          </button>
        </div>

        {comments.length === 0 && <div className="ai-empty">{t("review.noComments")}</div>}
        {comments.map((c) => (
          <div key={c.id} className={"review-card" + (c.resolved ? " is-resolved" : "")}>
            <button className="review-excerpt" onClick={() => go(c.from)} title={t("review.goToExcerpt")}>
              “{c.excerpt}”
            </button>
            <div className="review-body">{c.text}</div>
            <div className="review-meta">
              <span>{c.author || "—"} · {c.ts ? new Date(c.ts).toLocaleDateString(localeTag()) : ""}</span>
              <span className="ai-spacer" />
              <button
                className="tb-btn"
                title={c.resolved ? t("review.reopen") : t("review.resolve")}
                onClick={() => editor.chain().updateComment(c.id, { resolved: !c.resolved }).run()}
              >
                {c.resolved ? "↺" : "✓"}
              </button>
              <button
                className="tb-btn"
                title={t("review.deleteComment")}
                onClick={() => editor.chain().removeComment(c.id).run()}
              >
                🗑
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="review-section">
        <div className="review-section-title">
          {t("review.changes")}
          {changes.length > 0 && (
            <>
              <span className="ai-spacer" />
              <button className="tb-btn" title={t("review.acceptAll")} onClick={() => editor.chain().focus().resolveAllChanges(true).run()}>{t("review.acceptAllLabel")}</button>
              <button className="tb-btn" title={t("review.rejectAll")} onClick={() => editor.chain().focus().resolveAllChanges(false).run()}>{t("review.rejectAllLabel")}</button>
            </>
          )}
        </div>
        {changes.length === 0 && <div className="ai-empty">{t("review.noChanges")}</div>}
        {changes.map((ch, i) => (
          <div key={i} className="review-card">
            <button className="review-excerpt" onClick={() => go(ch.from)} title={t("review.goToExcerpt")}>
              <span className={ch.kind === "insertion" ? "track-ins" : "track-del"}>{ch.excerpt || t("review.empty")}</span>
            </button>
            <div className="review-meta">
              <span>{ch.kind === "insertion" ? t("review.inserted") : t("review.deleted")} · {ch.author || "—"}</span>
              <span className="ai-spacer" />
              <button
                className="tb-btn"
                title={t("review.accept")}
                onClick={() => editor.chain().focus().resolveChange({ from: ch.from, to: ch.to }, ch.kind, true).run()}
              >
                ✓
              </button>
              <button
                className="tb-btn"
                title={t("review.reject")}
                onClick={() => editor.chain().focus().resolveChange({ from: ch.from, to: ch.to }, ch.kind, false).run()}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
