import { useCallback, useEffect, useRef, useState } from "react";
import { Editor } from "@tiptap/react";
import {
  ChatMsg,
  ModelInfo,
  listModels,
  llmStatus,
  startLlm,
  stopLlm,
  streamChat,
  waitHealthy,
} from "../lib/ai";
import { Settings } from "../lib/settings";

type Status = "stopped" | "loading" | "ready" | "error";

interface AiPanelProps {
  editor: Editor | null;
  settings: Settings;
  onPersist: (patch: Partial<Settings>) => void;
  onClose: () => void;
}

const QUICK_ACTIONS: { label: string; system: string }[] = [
  { label: "Resumir", system: "Você é um assistente de escrita. Resuma o texto a seguir em português, de forma concisa e fiel." },
  { label: "Reescrever", system: "Reescreva o texto a seguir em português com mais clareza e fluidez, mantendo o sentido original. Responda apenas com o texto reescrito." },
  { label: "Revisar", system: "Revise a gramática e a ortografia do texto a seguir em português. Responda apenas com o texto corrigido." },
];

export function AiPanel({ editor, settings, onPersist, onClose }: AiPanelProps) {
  const [dir, setDir] = useState(settings.modelsDir);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelPath, setModelPath] = useState(settings.lastModelPath);
  const [ngl, setNgl] = useState(settings.ngl);
  const [ctx, setCtx] = useState(settings.ctx);

  const [status, setStatus] = useState<Status>("stopped");
  const [statusMsg, setStatusMsg] = useState("");
  const [port, setPort] = useState(0);

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Reflect any server already running (e.g. after a hot reload).
  useEffect(() => {
    llmStatus().then((s) => {
      if (s.running) {
        setStatus("ready");
        setPort(s.port);
        setModelPath(s.model);
      }
    });
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const scan = useCallback(async () => {
    try {
      const found = await listModels(dir);
      setModels(found);
      const firstChat = found.find((m) => !m.is_projector);
      if (firstChat && !modelPath) setModelPath(firstChat.path);
    } catch (e) {
      setStatusMsg(String(e));
    }
  }, [dir, modelPath]);

  useEffect(() => {
    scan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = useCallback(async () => {
    if (!modelPath) {
      setStatusMsg("Escolha um modelo primeiro.");
      return;
    }
    onPersist({ modelsDir: dir, lastModelPath: modelPath, ngl, ctx });
    setStatus("loading");
    setStatusMsg("Iniciando llama-server e carregando o modelo…");
    try {
      const p = await startLlm(modelPath, ngl, ctx);
      await waitHealthy(p);
      setPort(p);
      setStatus("ready");
      setStatusMsg("");
    } catch (e) {
      setStatus("error");
      setStatusMsg(String(e));
    }
  }, [modelPath, ngl, ctx, dir, onPersist]);

  const stop = useCallback(async () => {
    abortRef.current?.abort();
    await stopLlm();
    setStatus("stopped");
    setStatusMsg("");
  }, []);

  const runChat = useCallback(
    async (userContent: string, system?: string) => {
      if (status !== "ready" || streaming || !userContent.trim()) return;
      const userMsg: ChatMsg = { role: "user", content: userContent };
      const history = [...messages, userMsg];
      setMessages([...history, { role: "assistant", content: "" }]);
      setInput("");

      const convo: ChatMsg[] = system ? [{ role: "system", content: system }, ...history] : history;
      const ac = new AbortController();
      abortRef.current = ac;
      setStreaming(true);
      try {
        await streamChat(port, convo, (d) => {
          setMessages((m) => {
            const copy = [...m];
            const last = copy[copy.length - 1];
            copy[copy.length - 1] = {
              role: "assistant",
              content: last.content + (d.content ?? ""),
              reasoning: (last.reasoning ?? "") + (d.reasoning ?? "") || undefined,
            };
            return copy;
          });
        }, { signal: ac.signal });
      } catch (e) {
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { role: "assistant", content: `⚠️ ${e}` };
          return copy;
        });
      } finally {
        setStreaming(false);
      }
    },
    [status, streaming, messages, port]
  );

  const selectedText = useCallback((): string => {
    if (!editor) return "";
    const { from, to, empty } = editor.state.selection;
    if (empty) return "";
    return editor.state.doc.textBetween(from, to, "\n");
  }, [editor]);

  const runQuickAction = useCallback(
    (system: string) => {
      const sel = selectedText();
      const text = sel || editor?.getText() || "";
      if (!text.trim()) {
        setStatusMsg("Selecione um trecho (ou escreva algo) primeiro.");
        return;
      }
      runChat(text, system);
    },
    [selectedText, editor, runChat]
  );

  const insertIntoDoc = useCallback(
    (text: string) => {
      editor?.chain().focus().insertContent(text).run();
    },
    [editor]
  );

  const statusDot =
    status === "ready" ? "#22c55e" : status === "loading" ? "#eab308" : status === "error" ? "#ef4444" : "#9ca3af";

  return (
    <aside className="ai-panel">
      <div className="ai-header">
        <span className="ai-dot" style={{ background: statusDot }} />
        <strong>IA local</strong>
        <span className="ai-spacer" />
        <button
          className="tb-btn"
          onClick={() => {
            abortRef.current?.abort();
            setMessages([]);
          }}
          disabled={!messages.length}
          title="Limpar conversa (poupa contexto)"
        >
          🗑
        </button>
        <button className="tb-btn" onClick={onClose} title="Fechar painel">✕</button>
      </div>

      <div className="ai-config">
        <label className="ai-field">
          <span>Pasta de modelos</span>
          <div className="ai-row">
            <input value={dir} onChange={(e) => setDir(e.target.value)} spellCheck={false} />
            <button className="tb-btn" onClick={scan}>Escanear</button>
          </div>
        </label>

        <label className="ai-field">
          <span>Modelo ({models.filter((m) => !m.is_projector).length} encontrados)</span>
          <select value={modelPath} onChange={(e) => setModelPath(e.target.value)} disabled={status === "ready" || status === "loading"}>
            <option value="">— escolher —</option>
            {models.filter((m) => !m.is_projector).map((m) => (
              <option key={m.path} value={m.path}>
                {m.name} · {m.size_gb.toFixed(2)} GB
              </option>
            ))}
          </select>
        </label>

        <div className="ai-row ai-tune">
          <label title="Camadas na GPU (0 = só CPU)">
            GPU layers
            <input type="number" min={0} max={999} value={ngl} onChange={(e) => setNgl(Number(e.target.value))} disabled={status === "ready" || status === "loading"} />
          </label>
          <label title="Tamanho do contexto">
            Contexto
            <input type="number" min={512} step={512} value={ctx} onChange={(e) => setCtx(Number(e.target.value))} disabled={status === "ready" || status === "loading"} />
          </label>
          {status === "ready" ? (
            <button className="tb-btn ai-stop" onClick={stop}>Parar</button>
          ) : (
            <button className="tb-btn ai-start" onClick={start} disabled={status === "loading"}>
              {status === "loading" ? "Carregando…" : "Iniciar"}
            </button>
          )}
        </div>

        {statusMsg && <div className="ai-status-msg">{statusMsg}</div>}
      </div>

      <div className="ai-actions">
        {QUICK_ACTIONS.map((a) => (
          <button key={a.label} className="tb-btn" onClick={() => runQuickAction(a.system)} disabled={status !== "ready" || streaming} title={`${a.label} a seleção`}>
            {a.label}
          </button>
        ))}
      </div>

      <div className="ai-messages" ref={scrollRef}>
        {messages.length === 0 && <div className="ai-empty">Inicie um modelo e converse, ou selecione um trecho e use as ações acima.</div>}
        {messages.map((m, i) => (
          <div key={i} className={`ai-msg ai-${m.role}`}>
            {m.role === "assistant" && m.reasoning && (
              <details className="ai-reasoning" open={!m.content}>
                <summary>💭 Raciocínio</summary>
                <div className="ai-reasoning-body">{m.reasoning}</div>
              </details>
            )}
            <div className="ai-msg-body">
              {m.content || (streaming && i === messages.length - 1 && !m.reasoning ? "…" : "")}
            </div>
            {m.role === "assistant" && m.content && !m.content.startsWith("⚠️") && (
              <button className="ai-insert" onClick={() => insertIntoDoc(m.content)} title="Inserir no documento">Inserir ↧</button>
            )}
          </div>
        ))}
      </div>

      <form
        className="ai-input"
        onSubmit={(e) => {
          e.preventDefault();
          runChat(input);
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              runChat(input);
            }
          }}
          placeholder={status === "ready" ? "Pergunte algo… (Enter envia, Shift+Enter quebra linha)" : "Inicie um modelo para conversar"}
          disabled={status !== "ready"}
          rows={2}
        />
        {streaming ? (
          <button type="button" className="tb-btn" onClick={() => abortRef.current?.abort()}>Parar</button>
        ) : (
          <button type="submit" className="tb-btn ai-start" disabled={status !== "ready" || !input.trim()}>Enviar</button>
        )}
      </form>
    </aside>
  );
}
