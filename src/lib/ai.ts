import { invoke } from "@tauri-apps/api/core";

export interface ModelInfo {
  name: string;
  path: string;
  size_gb: number;
  is_projector: boolean;
}

export interface LlmStatus {
  running: boolean;
  port: number;
  model: string;
}

export interface ChatMsg {
  role: "system" | "user" | "assistant";
  content: string;
}

export const DEFAULT_MODELS_DIR = "D:\\LocalAIModels\\.lmstudio\\hub\\models";

// --- Rust command wrappers (snake_case keys to match the Rust params) ---

export const listModels = (dir: string) => invoke<ModelInfo[]>("list_models", { dir });

export const startLlm = (modelPath: string, nGpuLayers: number, ctxSize: number) =>
  invoke<number>("start_llm", {
    model_path: modelPath,
    n_gpu_layers: nGpuLayers,
    ctx_size: ctxSize,
  });

export const stopLlm = () => invoke<void>("stop_llm");

export const llmStatus = () => invoke<LlmStatus>("llm_status");

// --- llama-server HTTP (OpenAI-compatible, 127.0.0.1) ---

/** Poll /health until the model is fully loaded, or time out. */
export async function waitHealthy(port: number, timeoutMs = 180000): Promise<void> {
  const start = Date.now();
  for (;;) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/health`);
      if (r.ok) return;
    } catch {
      /* server still warming up */
    }
    if (Date.now() - start > timeoutMs) throw new Error("o modelo demorou demais para carregar");
    await new Promise((res) => setTimeout(res, 500));
  }
}

/** Stream a chat completion, calling onToken for each text delta. */
export async function streamChat(
  port: number,
  messages: ChatMsg[],
  onToken: (t: string) => void,
  opts: { temperature?: number; signal?: AbortSignal } = {}
): Promise<void> {
  const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages,
      stream: true,
      temperature: opts.temperature ?? 0.7,
    }),
    signal: opts.signal,
  });
  if (!res.ok || !res.body) throw new Error(`a IA respondeu ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") return;
      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) onToken(delta);
      } catch {
        /* ignore partial/keepalive lines */
      }
    }
  }
}
