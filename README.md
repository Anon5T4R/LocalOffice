<div align="center">
  <img src="src-tauri/icons/128x128.png" alt="LocalOffice" width="96" />

  # LocalOffice

  **Editor de documentos 100% offline, com IA local (GGUF) — sem nuvem, sem telemetria, sem ping.**
</div>

---

LocalOffice é um editor de documentos focado em privacidade e simplicidade. Tudo roda na sua
máquina: a edição, a conversão de formatos e a IA. Se você quiser sincronizar, basta deixar seus
arquivos numa pasta do Syncthing/OneDrive/Drive — o app nem precisa saber que isso existe.

## ✨ Recursos

- **Editor rico** (TipTap/ProseMirror): títulos, listas (incl. tarefas), citações, código, **tabelas** e **imagens**.
- **Menu de barra `/`** estilo Notion para inserir blocos rapidamente.
- **Ribbon estilo Word/OnlyOffice** com formatação completa (negrito, itálico, sublinhado, cor, realce, alinhamento…).
- **Formatos**: Markdown, HTML, **DOCX** e **ODT** (via [pandoc](https://pandoc.org) embarcado).
- **IA local**: roda modelos **GGUF** via [llama.cpp](https://github.com/ggml-org/llama.cpp) (build Vulkan, com fallback de CPU).
  Chat com streaming + ações sobre a seleção (resumir, reescrever, revisar). Tudo em `127.0.0.1`, **zero telemetria**.
- **Tema** claro/escuro/automático, arquivos recentes e preferências persistentes.

## 🧱 Stack

- **Tauri 2** (Rust) — shell nativo leve
- **React + TypeScript + Vite** — interface
- **TipTap** — editor
- **pandoc** (sidecar) — conversão DOCX/ODT
- **llama.cpp** (`llama-server`, sidecar) — IA local

## 🚀 Rodando em desenvolvimento

Pré-requisitos: **Rust** (toolchain MSVC no Windows), **Node 18+**, e as
[dependências do Tauri](https://tauri.app/start/prerequisites/) (no Windows: Visual Studio Build Tools + WebView2).

```bash
# 1. dependências do frontend
npm install

# 2. baixar os binários nativos (não versionados; ~260MB no total)
powershell -ExecutionPolicy Bypass -File scripts/fetch-pandoc.ps1
powershell -ExecutionPolicy Bypass -File scripts/fetch-llama.ps1

# 3. rodar
npm run tauri dev
```

Para gerar o instalável:

```bash
npm run tauri build   # gera um instalador NSIS em src-tauri/target/release/bundle/nsis
```

## 🤖 Usando a IA

1. Tenha modelos `.gguf` numa pasta (ex.: a pasta do LM Studio).
2. Abra o painel **✦ IA**, ajuste a pasta em ⚙ Configurações, escaneie e escolha um modelo.
3. Clique **Iniciar**. O `llama-server` sobe localmente e você conversa — offline.

## 💡 Filosofia

Todo o software é **open-source**. A forma de monetização não é o software (que é livre para todos),
e sim a instalação facilitada e modelos GGUF próprios. Sinta-se à vontade para usar, adaptar e contribuir.

## 📄 Licença

Código sob licença **MIT** (veja [LICENSE](LICENSE)).

Os binários de terceiros embarcados no instalador mantêm suas próprias licenças:
[pandoc](https://github.com/jgm/pandoc) (GPL-2.0+) e [llama.cpp](https://github.com/ggml-org/llama.cpp) (MIT),
distribuídos sem modificação.
