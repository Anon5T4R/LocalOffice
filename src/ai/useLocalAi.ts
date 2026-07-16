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
import {
  ResultMode,
  SELECTION_ACTIONS,
  chunkDocument,
  estimateTokens,
} from "./actions";
import { t } from "../lib/i18n";

export type Status = "stopped" | "loading" | "ready" | "error";

export interface ResultMeta {
  mode: ResultMode;
  from: number;
  to: number;
}

// A message as shown in the panel. `kind: "action"` rows are one-shot results
// (transform/summarize/continue) and are NOT replayed into the chat context.
export interface UiMsg {
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  kind: "chat" | "action";
  result?: ResultMeta;
  error?: boolean;
}

export interface LocalAi {
  // config
  dir: string;
  setDir: (v: string) => void;
  models: ModelInfo[];
  modelPath: string;
  setModelPath: (v: string) => void;
  ngl: number;
  setNgl: (v: number) => void;
  ctx: number;
  setCtx: (v: number) => void;
  // runtime
  status: Status;
  statusMsg: string;
  ready: boolean;
  messages: UiMsg[];
  streaming: boolean;
  // ops
  scan: () => Promise<void>;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  abort: () => void;
  clear: () => void;
  sendChat: (text: string) => Promise<void>;
  runSelection: (actionId: string, arg?: string) => Promise<void>;
  summarizeDocument: () => Promise<void>;
}

export function useLocalAi(
  editor: Editor | null,
  settings: Settings,
  onPersist: (patch: Partial<Settings>) => void
): LocalAi {
  const [dir, setDir] = useState(settings.modelsDir);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelPath, setModelPath] = useState(settings.lastModelPath);
  const [ngl, setNgl] = useState(settings.ngl);
  const [ctx, setCtx] = useState(settings.ctx);

  const [status, setStatus] = useState<Status>("stopped");
  const [statusMsg, setStatusMsg] = useState("");
  const [messages, setMessages] = useState<UiMsg[]>([]);
  const [streaming, setStreaming] = useState(false);

  const portRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  useEffect(() => {
    let cancelled = false;
    llmStatus().then((s) => {
      if (cancelled) return;
      if (s.running) {
        portRef.current = s.port;
        setStatus("ready");
        setModelPath(s.model);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const scan = useCallback(async () => {
    if (!dir.trim()) {
      setStatusMsg(t("aiStatus.configFolder"));
      return;
    }
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
    // Never scanned a guessed path on boot: with no folder configured there
    // is nothing to do (and no error to show until the user opens the panel).
    if (settings.modelsDir.trim()) scan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = useCallback(async () => {
    if (!modelPath) {
      setStatusMsg(t("aiStatus.chooseModel"));
      return;
    }
    onPersist({ modelsDir: dir, lastModelPath: modelPath, ngl, ctx });
    setStatus("loading");
    setStatusMsg(t("aiStatus.starting"));
    try {
      const p = await startLlm(modelPath, ngl, ctx);
      await waitHealthy(p);
      portRef.current = p;
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

  const abort = useCallback(() => abortRef.current?.abort(), []);
  const clear = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
  }, []);

  // Append a user row + an assistant row, then stream `convo` into the assistant.
  const appendAndStream = useCallback(
    async (convo: ChatMsg[], userRow: UiMsg, result?: ResultMeta): Promise<string> => {
      setMessages((m) => [...m, userRow, { role: "assistant", content: "", kind: userRow.kind, result }]);
      const ac = new AbortController();
      abortRef.current = ac;
      setStreaming(true);
      let full = "";
      try {
        await streamChat(
          portRef.current,
          convo,
          (d) => {
            if (d.content) full += d.content;
            setMessages((m) => {
              const copy = [...m];
              const last = copy[copy.length - 1];
              copy[copy.length - 1] = {
                ...last,
                content: last.content + (d.content ?? ""),
                reasoning: (last.reasoning ?? "") + (d.reasoning ?? "") || undefined,
              };
              return copy;
            });
          },
          { signal: ac.signal }
        );
      } catch (e) {
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { role: "assistant", content: `⚠️ ${e}`, kind: userRow.kind, error: true };
          return copy;
        });
      } finally {
        setStreaming(false);
      }
      return full;
    },
    []
  );

  // Free chat: replays only previous chat turns (not one-shot actions).
  const sendChat = useCallback(
    async (text: string) => {
      if (status !== "ready" || streaming || !text.trim()) return;
      const history = messages
        .filter((m) => m.kind === "chat" && !m.error)
        .map((m) => ({ role: m.role, content: m.content }) as ChatMsg);
      const convo: ChatMsg[] = [...history, { role: "user", content: text }];
      await appendAndStream(convo, { role: "user", content: text, kind: "chat" });
    },
    [status, streaming, messages, appendAndStream]
  );

  // One-shot transform of the current selection (fired from the bubble menu).
  const runSelection = useCallback(
    async (actionId: string, arg?: string) => {
      const action = SELECTION_ACTIONS[actionId];
      if (!editor || !action || status !== "ready" || streaming) return;
      const { from, to, empty } = editor.state.selection;
      if (empty) {
        setStatusMsg(t("aiStatus.selectFirst"));
        return;
      }
      const text = editor.state.doc.textBetween(from, to, "\n");
      const base = t(action.labelKey);
      const label = arg ? `${base} (${arg})` : base;
      const convo: ChatMsg[] = [
        { role: "system", content: action.system(arg) },
        { role: "user", content: text },
      ];
      await appendAndStream(
        convo,
        { role: "user", content: `**${label}** — ${t("aiMsg.selection")}`, kind: "action" },
        { mode: action.mode, from, to }
      );
    },
    [editor, status, streaming, appendAndStream]
  );

  // Whole-document summary via map-reduce over chapter-sized chunks.
  const summarizeDocument = useCallback(async () => {
    if (!editor || status !== "ready" || streaming) return;
    // Budget ~55% of the context (chars) for input; leave room for prompt + output.
    const maxChars = Math.max(800, Math.floor(ctxRef.current * 4 * 0.55));
    const chunks = await chunkDocument(editor, maxChars);
    if (!chunks.length || !chunks[0].trim()) {
      setStatusMsg(t("aiStatus.docEmpty"));
      return;
    }

    const partsLabel = t(chunks.length === 1 ? "aiMsg.partsOne" : "aiMsg.partsMany", { n: chunks.length });
    const tokensLabel = t("aiMsg.tokens", { n: estimateTokens(editor.getText()) });
    setMessages((m) => [
      ...m,
      { role: "user", content: `**${t("aiMsg.summarizeDocTitle")}** — ${partsLabel}, ${tokensLabel}`, kind: "action" },
    ]);

    const ac = new AbortController();
    abortRef.current = ac;
    setStreaming(true);
    try {
      const partials: string[] = [];
      for (let i = 0; i < chunks.length; i++) {
        if (ac.signal.aborted) return;
        setStatusMsg(t("aiStatus.summarizing", { i: i + 1, n: chunks.length }));
        let part = "";
        await streamChat(
          portRef.current,
          [
            { role: "system", content: t("aiSys.summarizeChunk") },
            { role: "user", content: chunks[i] },
          ],
          (d) => {
            if (d.content) part += d.content;
          },
          { signal: ac.signal }
        );
        partials.push(part.trim());
      }

      // Reduce: summarize the partial summaries into one (single pass; the joined
      // partials are far smaller than the document).
      setStatusMsg(t("aiStatus.joining"));
      const joined = partials.map((p, i) => `${t("ai.part", { n: i + 1 })}:\n${p}`).join("\n\n");
      const reduceConvo: ChatMsg[] =
        chunks.length === 1
          ? []
          : [
              { role: "system", content: t("aiSys.combine") },
              { role: "user", content: joined },
            ];

      if (reduceConvo.length === 0) {
        setMessages((m) => [...m, { role: "assistant", content: partials[0], kind: "action", result: { mode: "show", from: 0, to: 0 } }]);
      } else {
        setMessages((m) => [...m, { role: "assistant", content: "", kind: "action", result: { mode: "show", from: 0, to: 0 } }]);
        await streamChat(
          portRef.current,
          reduceConvo,
          (d) => {
            setMessages((m) => {
              const copy = [...m];
              const last = copy[copy.length - 1];
              copy[copy.length - 1] = { ...last, content: last.content + (d.content ?? ""), reasoning: (last.reasoning ?? "") + (d.reasoning ?? "") || undefined };
              return copy;
            });
          },
          { signal: ac.signal }
        );
      }
      setStatusMsg("");
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: `⚠️ ${e}`, kind: "action", error: true }]);
    } finally {
      setStreaming(false);
    }
  }, [editor, status, streaming]);

  return {
    dir,
    setDir,
    models,
    modelPath,
    setModelPath,
    ngl,
    setNgl,
    ctx,
    setCtx,
    status,
    statusMsg,
    ready: status === "ready",
    messages,
    streaming,
    scan,
    start,
    stop,
    abort,
    clear,
    sendChat,
    runSelection,
    summarizeDocument,
  };
}
