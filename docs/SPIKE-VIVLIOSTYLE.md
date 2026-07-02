# Spike: migrar o print/PDF de paged.js para Vivliostyle?

**Data:** 2026-07-02 · **Harness:** `scripts/spike-vivliostyle/` (`npx vite scripts/spike-vivliostyle --port 1435`)
**Motivação:** paged.js 0.4.3 está sem release desde 2022; Vivliostyle é o único outro motor
de CSS Paged Media mantido que roda no browser.

## Veredito: **NÃO migrar.** Manter paged.js.

O motivo decisivo nem é técnico:

### 1. Licença — bloqueador
`@vivliostyle/core` é **AGPL-3.0**. O LocalOffice é **MIT** e distribui instalador (NSIS).
Embutir o Vivliostyle no bundle obriga a distribuir o app inteiro sob AGPL (não existe
licença comercial alternativa; o projeto é de uma fundação). paged.js é MIT.
Relicenciar o app para AGPL é uma decisão de produto, não de refatoração.

### 2. Fidelidade — empate no nosso conjunto de features
O harness renderiza o mesmo documento com o mesmo CSS de impressão nos dois motores,
lado a lado. Resultado no fixture (TOC + notas + quebra manual + tabela + margin boxes):

| Critério | paged.js 0.4.3 | Vivliostyle 2.43.3 |
|---|---|---|
| Contagem de páginas | 2 | 2 (idêntica) |
| Quebra manual (`break-after: page`) | ✅ | ✅ |
| Margin boxes (`@top-center`, `counter(page)/counter(pages)`) | ✅ | ✅ |
| `@page :first` suprimindo cabeçalho/rodapé | ✅ | ✅ |
| `target-counter` no sumário | ✅ (1, 1, 2, 2) | ✅ (1, 1, 2, 2)¹ |
| Tempo no fixture (2 págs) | 62 ms | 267 ms |

¹ No harness o Vivliostyle mostrou um "0" extra após cada número — contaminação dos
estilos que o **paged.js injeta globalmente em `document.head`**, que vazaram para o
pane vizinho. Artefato do lado-a-lado, mas uma demonstração involuntária e perfeita do
risco de estado global do paged.js que a fila serializada de `src/lib/pdf.ts` existe
para domar.

### 3. Custo/risco de migração — alto
- A API do Vivliostyle é um *viewer* completo (navegação, zoom, spreads, EPUB), não um
  fragmentador: `CoreViewer` renderiza dentro de um `viewportElement` próprio, com
  scroll/zoom próprios — o PrintPreview atual teria que ser reescrito em volta dele.
- Todo o conhecimento tácito acumulado no pipeline (fila serializada, StrictMode,
  counters que não sobrevivem à fragmentação, timeout de 90s) seria re-aprendido.
- Bundle: ~751 KB min (vivliostyle) vs ~491 KB min (paged.min) — pior, e o paged.js já
  é lazy-loaded em chunk próprio.

### O que fazer com o risco do paged.js parado
1. **Curto prazo (feito nesta branch):** progresso de paginação via evento `"page"` do
   `Previewer` com API agnóstica de motor; risco documentado em `src/lib/pdf.ts`.
2. **Se um dia quebrar** (ex.: mudança no WebView2): paged.js é MIT — vendorizar/forkar
   o fragmentador é viável; o fallback `printLegacy` (window.print) continua existindo
   e não depende de motor nenhum.
3. **Reavaliar Vivliostyle apenas se** o projeto aceitar AGPL ou o Vivliostyle mudar de
   licença. Tecnicamente ele é sólido, ativo (engines node >= 20, releases frequentes)
   e a paridade de fidelidade ficou comprovada no harness.

### Pontos positivos do Vivliostyle registrados (para uma futura reavaliação)
- `loadDocument` aceita `documentObject` (DOM já parseado) + `authorStyleSheet` como
  texto — sem a dança de blob URL que o paged.js exige.
- Renderiza estritamente dentro do `viewportElement` (sem estado global vazando).
- Eventos `loaded`/`error` + `readyState`; suporte nativo a EPUB/WebPub.
