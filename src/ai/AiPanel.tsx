import { useEffect, useRef, useState } from "react";
import { Editor } from "@tiptap/react";
import { LocalAi, ResultMeta } from "./useLocalAi";
import { t } from "../lib/i18n";

interface AiPanelProps {
  editor: Editor | null;
  ai: LocalAi;
  onClose: () => void;
}

export function AiPanel({ editor, ai, onClose }: AiPanelProps) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [ai.messages]);

  const replaceSelection = (text: string, r: ResultMeta) => {
    editor?.chain().focus().insertContentAt({ from: r.from, to: r.to }, text).run();
  };
  const insertBelow = (text: string, r: ResultMeta) => {
    const at = r.to || editor?.state.selection.to || editor?.state.doc.content.size || 0;
    editor?.chain().focus().insertContentAt(at, "\n" + text).run();
  };
  const copy = (text: string) =>
    navigator.clipboard?.writeText(text).catch((e) => console.error("clipboard:", e));

  const statusDot =
    ai.status === "ready" ? "#22c55e" : ai.status === "loading" ? "#eab308" : ai.status === "error" ? "#ef4444" : "#9ca3af";

  const busy = ai.status !== "ready" || ai.streaming;

  return (
    <aside className="ai-panel">
      <div className="ai-header">
        <span className="ai-dot" style={{ background: statusDot }} />
        <strong>{t("ai.title")}</strong>
        <span className="ai-spacer" />
        <button className="tb-btn" onClick={ai.clear} disabled={!ai.messages.length} title={t("ai.clearChat")}>🗑</button>
        <button className="tb-btn" onClick={onClose} title={t("common.closePanel")}>✕</button>
      </div>

      <div className="ai-config">
        <label className="ai-field">
          <span>{t("ai.modelsFolder")}</span>
          <div className="ai-row">
            <input value={ai.dir} onChange={(e) => ai.setDir(e.target.value)} spellCheck={false} />
            <button className="tb-btn" onClick={ai.scan}>{t("ai.scan")}</button>
          </div>
        </label>

        <label className="ai-field">
          <span>{t("ai.modelFound", { n: ai.models.filter((m) => !m.is_projector).length })}</span>
          <select value={ai.modelPath} onChange={(e) => ai.setModelPath(e.target.value)} disabled={ai.status === "ready" || ai.status === "loading"}>
            <option value="">{t("ai.chooseModel")}</option>
            {ai.models.filter((m) => !m.is_projector).map((m) => (
              <option key={m.path} value={m.path}>{m.name} · {m.size_gb.toFixed(2)} GB</option>
            ))}
          </select>
        </label>

        <div className="ai-row ai-tune">
          <label title={t("ai.gpuLayersTitle")}>
            {t("ai.gpuLayers")}
            <input type="number" min={0} max={999} value={ai.ngl} onChange={(e) => ai.setNgl(Number(e.target.value))} disabled={ai.status === "ready" || ai.status === "loading"} />
          </label>
          <label title={t("ai.ctxTitle")}>
            {t("ai.ctx")}
            <input type="number" min={512} step={512} value={ai.ctx} onChange={(e) => ai.setCtx(Number(e.target.value))} disabled={ai.status === "ready" || ai.status === "loading"} />
          </label>
          {ai.status === "ready" ? (
            <button className="tb-btn ai-stop" onClick={ai.stop}>{t("ai.stop")}</button>
          ) : (
            <button className="tb-btn ai-start" onClick={ai.start} disabled={ai.status === "loading"}>
              {ai.status === "loading" ? t("ai.loading") : t("ai.start")}
            </button>
          )}
        </div>

        {ai.statusMsg && <div className="ai-status-msg">{ai.statusMsg}</div>}
      </div>

      <div className="ai-actions">
        <button className="tb-btn" onClick={ai.summarizeDocument} disabled={busy} title={t("ai.summarizeDocTitle")}>
          {t("ai.summarizeDoc")}
        </button>
        <span className="ai-hint">{t("ai.selectHint")}</span>
      </div>

      <div className="ai-messages" ref={scrollRef}>
        {ai.messages.length === 0 && (
          <div className="ai-empty">{t("ai.empty")}</div>
        )}
        {ai.messages.map((m, i) => (
          <div key={i} className={`ai-msg ai-${m.role}`}>
            {m.role === "assistant" && m.reasoning && (
              <details className="ai-reasoning" open={!m.content}>
                <summary>{t("ai.reasoning")}</summary>
                <div className="ai-reasoning-body">{m.reasoning}</div>
              </details>
            )}
            <div className="ai-msg-body">
              {m.content || (ai.streaming && i === ai.messages.length - 1 && !m.reasoning ? "…" : "")}
            </div>
            {m.role === "assistant" && m.content && !m.error && (
              <div className="ai-result-actions">
                {m.result && m.result.mode !== "show" && (
                  <button className="ai-insert" onClick={() => replaceSelection(m.content, m.result!)} title={t("ai.replaceSelectionTitle")}>{t("ai.replaceSelection")}</button>
                )}
                <button className="ai-insert" onClick={() => (m.result ? insertBelow(m.content, m.result) : editor?.chain().focus().insertContent(m.content).run())} title={t("ai.insertBelowTitle")}>{t("ai.insertBelow")}</button>
                <button className="ai-insert" onClick={() => copy(m.content)} title={t("ai.copy")}>{t("ai.copy")}</button>
              </div>
            )}
          </div>
        ))}
      </div>

      <form className="ai-input" onSubmit={(e) => { e.preventDefault(); ai.sendChat(input); setInput(""); }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              ai.sendChat(input);
              setInput("");
            }
          }}
          placeholder={ai.status === "ready" ? t("ai.inputReady") : t("ai.inputIdle")}
          disabled={ai.status !== "ready"}
          rows={2}
        />
        {ai.streaming ? (
          <button type="button" className="tb-btn" onClick={ai.abort}>{t("ai.stop")}</button>
        ) : (
          <button type="submit" className="tb-btn ai-start" disabled={ai.status !== "ready" || !input.trim()}>{t("ai.send")}</button>
        )}
      </form>
    </aside>
  );
}
