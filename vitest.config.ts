import { defineConfig } from "vitest/config";

// Testes cobrem apenas funções puras (sem editor TipTap vivo, sem backend
// Tauri). jsdom fornece DOMParser/localStorage; `invoke` nunca é chamado
// porque os caminhos testados não dependem do backend.
export default defineConfig({
  test: {
    environment: "jsdom",
  },
});
