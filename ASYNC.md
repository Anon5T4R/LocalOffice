# Auditoria Async

Levantamento de operações síncronas que poderiam/deveriam ser assíncronas no Writer.

## Itens implementados

### 1. `wait_for_port` / `start_llm` — Rust (lib.rs)

**Antes:** `wait_for_port` usava `std::thread::sleep()` em loop de polling, bloqueando uma thread do pool do Tauri por até 180 segundos.

**Depois:** Função convertida para `async` usando `tokio::time::sleep` e `tokio::net::TcpStream`. O comando `start_llm` também passou a ser `async`.

**Arquivos:** `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`

---

### 4. `markdownToHtml` — TypeScript (markdown.ts)

**Antes:** `marked.parse(md, { async: false })` — processamento síncrono que bloqueia a event loop.

**Depois:** `await marked.parse(md)` — processamento assíncrono, liberando a thread principal.

**Arquivos:** `src/lib/markdown.ts`, `src/lib/document.ts`

---

### 7. `exit_app` — log de erro (App.tsx)

**Antes:** `.catch(() => {})` engolia silenciosamente qualquer erro ao sair.

**Depois:** `.catch((e) => console.error("exit_app:", e))` — erros são logados para debug.

**Arquivo:** `src/App.tsx`

---

### 8. Cleanup de listeners — Race condition (App.tsx)

**Antes:** O cleanup do `useEffect` do `close-requested` registrava um `.then()` na promise do `listen()`, mas se o componente desmontasse antes da promise resolver, o `unlisten()` nunca era chamado.

**Depois:** Usa ref + flag `cancelled`: se o `listen()` resolver depois do unmount, o listener é removido imediatamente.

**Arquivo:** `src/App.tsx`

---

### 9. Autosave — Race condition (App.tsx)

**Antes:** Se o autosave demorasse mais que o debounce (2s md, 4s docx/odt), dois saves podiam ocorrer em paralelo, com risco de corrupção em formatos binários (docx/odt via pandoc).

**Depois:** Flag `savingRef` impede que um novo save comece enquanto o anterior não terminou.

**Arquivo:** `src/App.tsx`

---

### 10. Promises aninhadas em `open-file` (App.tsx)

**Antes:** `openDocumentPath(p).then(openDocFile).catch(() => {})` — o `.catch()` só tratava erros da promise externa. Erros de `openDocFile` viravam unhandled rejections.

**Depois:** Substituído por `async/await` com `try/catch` interno, garantindo que todos os erros são capturados.

**Arquivo:** `src/App.tsx`

---

### 11. `llmStatus()` sem cancelamento (useLocalAi.ts)

**Antes:** `.then()` dentro de `useEffect` sem flag de cancelamento. Se o componente desmontasse antes da promise resolver, `setStatus`/`setModelPath` seriam chamados em componente desmontado (warning no React 18+).

**Depois:** Flag `cancelled` que impede state updates após unmount.

**Arquivo:** `src/ai/useLocalAi.ts`

---

### 12. Clipboard — erro silencioso (AiPanel.tsx)

**Antes:** `navigator.clipboard.writeText(text).catch(() => {})` — erros de permissão eram engolidos.

**Depois:** `.catch((e) => console.error("clipboard:", e))` — erros são logados.

**Arquivo:** `src/ai/AiPanel.tsx`

---

## Itens implementados (2º lote)

### 2. `read_text_file` / `read_file_base64` / `write_text_file` — Rust (lib.rs)

**Antes:** Comandos síncronos usando `std::fs::read_to_string`, `std::fs::read`, `std::fs::write`.

**Depois:** Comandos `async` usando `tokio::fs`, liberando a thread pool do Tauri.

---

### 3. `list_models` / `collect_gguf` — Rust (lib.rs)

**Antes:** Travessia recursiva de diretório bloqueando a thread pool.

**Depois:** `list_models` virou `async` e delega o trabalho pesado para `tokio::task::spawn_blocking`, movendo a travessia para a thread pool de blocking I/O.

---

### 5. `chunkDocument` — yielding (actions.ts)

**Antes:** Itera todos os nós do ProseMirror doc sincronamente, podendo travar a UI em documentos muito grandes.

**Depois:** Função `async` que `await`s a cada 100 blocos, permitindo que a event loop processe outros eventos entre batches.

---

### 6. `computeResults` — throttle (SearchExtension.ts)

**Antes:** Recomputava resultados de busca em toda mudança do documento (a cada tecla), mesmo durante digitação rápida.

**Depois:** Recomputação automática é limitada a no máximo uma vez a cada 200ms. Durante digitação rápida, os resultados ficam desatualizados momentaneamente, mas atualizam quando o usuário pausa.

---

### 13. `SlashItem.command` async (items.ts)

**Antes:** Interface `() => void` impedia funções async. O comando "Imagem" usava `.then()` com race condition potencial.

**Depois:** Interface aceita `void | Promise<void>`. Comando "Imagem" usa `async`/`await` e insere a imagem na mesma transação depois do diálogo de arquivo fechar, eliminando o race condition.

---
