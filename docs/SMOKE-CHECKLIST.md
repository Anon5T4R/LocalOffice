# Smoke checklist manual

Rodar os itens relevantes ao fim de cada fase da refatoração (`npm run tauri dev`);
o checklist completo antes de mergear a branch (aí também com `npm run tauri build`).

## Arquivos e abas
- [ ] Abrir um `.md` existente; conteúdo e formatação corretos.
- [ ] Abrir um `.docx` (via pandoc); notas, tabelas e imagens presentes.
- [ ] Salvar (`Ctrl+S`) nos dois formatos; reabrir e conferir roundtrip.
- [ ] Salvar como (`Ctrl+Shift+S`) muda o caminho e o título da aba.
- [ ] Autosave: editar e esperar ~4s → indicador de sujo some sozinho.
- [ ] Trocar de aba com edições pendentes e voltar → nada se perde.
- [ ] Fechar aba suja (`Ctrl+W`) → pede confirmação.
- [ ] Fechar o app com abas sujas → diálogo "close-requested" aparece.
- [ ] "Abrir com" pelo Explorer (associação de arquivo) abre em nova aba.
- [ ] Recentes no menu funcionam.

## Editor
- [ ] Ribbon completa: cada botão das 3 abas (Início / Inserir / Layout).
- [ ] Slash menu (`/`) e autocomplete de citação (`@`) abrem sem crash.
- [ ] Numeração automática de títulos liga/desliga (Layout).
- [ ] Notas de rodapé: inserir, numeração na página, remover.
- [ ] Revisão: track changes on/off, comentário, aceitar/rejeitar.
- [ ] Busca (`Ctrl+F`) encontra e navega.
- [ ] Zoom: `Ctrl+scroll`, `Ctrl++/-/0`, seletor da status bar.
- [ ] Modo foco: `F11` entra, `Esc`/botão "✕ foco" sai.
- [ ] Ghost pages aparecem em formato A4 e respeitam quebras de página.

## Print / PDF
- [ ] Print preview abre, pagina e mostra contagem de páginas.
- [ ] Cabeçalho/rodapé com `{page}`/`{pages}`/`{title}` renderizam.
- [ ] Sumário no preview tem números de página.
- [ ] `Esc` fecha o preview; reabrir em seguida funciona (fila do paged.js).

## Citações / bibliografia
- [ ] Configurar `.bib` nas configurações → autocomplete `@` lista os itens.
- [ ] Trocar estilo CSL (ABNT → APA) reformata as citações.
- [ ] Bloco de bibliografia renderiza no preview e no export.

## IA local
- [ ] Listar modelos, iniciar servidor, status "rodando", chat com streaming, parar.

## Diversos
- [ ] Importar fonte `.ttf` → aparece no seletor e aplica.
- [ ] Template aplica sem apagar aba errada.
- [ ] Histórico de versões: salvar, listar, restaurar, excluir.
- [ ] Configurações: tema claro/escuro, meta de palavras na status bar.
