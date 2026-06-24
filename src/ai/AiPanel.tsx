import { useEffect, useRef, useState } from "react";
import { Editor } from "@tiptap/react";
import { LocalAi, ResultMeta } from "./useLocalAi";

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
  const copy = (text: string) => navigator.clipboard?.writeText(text).catch(() => {});

  const statusDot =
    ai.status === "ready" ? "#22c55e" : ai.status === "loading" ? "#eab308" : ai.status === "error" ? "#ef4444" : "#9ca3af";

  const busy = ai.status !== "ready" || ai.streaming;

  return (
    <aside className="ai-panel">
      <div className="ai-header">
        <span className="ai-dot" style={{ background: statusDot }} />
        <strong>IA local</strong>
        <span className="ai-spacer" />
        <button className="tb-btn" onClick={ai.clear} disabled={!ai.messages.length} title="Limpar conversa (poupa contexto)">🗑</button>
        <button className="tb-btn" onClick={onClose} title="Fechar painel">✕</button>
      </div>

      <div className="ai-config">
        <label className="ai-field">
          <span>Pasta de modelos</span>
          <div className="ai-row">
            <input value={ai.dir} onChange={(e) => ai.setDir(e.target.value)} spellCheck={false} />
            <button className="tb-btn" onClick={ai.scan}>Escanear</button>
          </div>
        </label>

        <label className="ai-field">
          <span>Modelo ({ai.models.filter((m) => !m.is_projector).length} encontrados)</span>
          <select value={ai.modelPath} onChange={(e) => ai.setModelPath(e.target.value)} disabled={ai.status === "ready" || ai.status === "loading"}>
            <option value="">— escolher —</option>
            {ai.models.filter((m) => !m.is_projector).map((m) => (
              <option key={m.path} value={m.path}>{m.name} · {m.size_gb.toFixed(2)} GB</option>
            ))}
          </select>
        </label>

        <div className="ai-row ai-tune">
          <label title="Camadas na GPU (0 = só CPU)">
            GPU layers
            <input type="number" min={0} max={999} value={ai.ngl} onChange={(e) => ai.setNgl(Number(e.target.value))} disabled={ai.status === "ready" || ai.status === "loading"} />
          </label>
          <label title="Tamanho do contexto">
            Contexto
            <input type="number" min={512} step={512} value={ai.ctx} onChange={(e) => ai.setCtx(Number(e.target.value))} disabled={ai.status === "ready" || ai.status === "loading"} />
          </label>
          {ai.status === "ready" ? (
            <button className="tb-btn ai-stop" onClick={ai.stop}>Parar</button>
          ) : (
            <button className="tb-btn ai-start" onClick={ai.start} disabled={ai.status === "loading"}>
              {ai.status === "loading" ? "Carregando…" : "Iniciar"}
            </button>
          )}
        </div>

        {ai.statusMsg && <div className="ai-status-msg">{ai.statusMsg}</div>}
      </div>

      <div className="ai-actions">
        <button className="tb-btn" onClick={ai.summarizeDocument} disabled={busy} title="Resume o documento inteiro por partes (map-reduce)">
          Resumir documento
        </button>
        <span className="ai-hint">Selecione um trecho no texto para ver as ações de IA.</span>
      </div>

      <div className="ai-messages" ref={scrollRef}>
        {ai.messages.length === 0 && (
          <div className="ai-empty">
            Inicie um modelo e converse, selecione um trecho para transformar/traduzir/continuar, ou use “Resumir documento”.
          </div>
        )}
        {ai.messages.map((m, i) => (
          <div key={i} className={`ai-msg ai-${m.role}`}>
            {m.role === "assistant" && m.reasoning && (
              <details className="ai-reasoning" open={!m.content}>
                <summary>💭 Raciocínio</summary>
                <div className="ai-reasoning-body">{m.reasoning}</div>
              </details>
            )}
            <div className="ai-msg-body">
              {m.content || (ai.streaming && i === ai.messages.length - 1 && !m.reasoning ? "…" : "")}
            </div>
            {m.role === "assistant" && m.content && !m.error && (
              <div className="ai-result-actions">
                {m.result && m.result.mode !== "show" && (
                  <button className="ai-insert" onClick={() => replaceSelection(m.content, m.result!)} title="Trocar o trecho selecionado por este texto">Substituir seleção</button>
                )}
                <button className="ai-insert" onClick={() => (m.result ? insertBelow(m.content, m.result) : editor?.chain().focus().insertContent(m.content).run())} title="Inserir no documento">Inserir abaixo ↧</button>
                <button className="ai-insert" onClick={() => copy(m.content)} title="Copiar">Copiar</button>
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
          placeholder={ai.status === "ready" ? "Pergunte ou peça algo… (Enter envia, Shift+Enter quebra linha)" : "Inicie um modelo para conversar"}
          disabled={ai.status !== "ready"}
          rows={2}
        />
        {ai.streaming ? (
          <button type="button" className="tb-btn" onClick={ai.abort}>Parar</button>
        ) : (
          <button type="submit" className="tb-btn ai-start" disabled={ai.status !== "ready" || !input.trim()}>Enviar</button>
        )}
      </form>
    </aside>
  );
}
