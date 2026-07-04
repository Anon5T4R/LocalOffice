# Guia de uso — LocalOffice

Como tirar o máximo do app por perfil de uso, onde fica cada ferramenta e
como trabalhar com cada formato de arquivo. Tudo funciona 100% offline.

---

## Regra de ouro dos formatos

> **Trabalhe em `.md` → entregue em `.docx` → publique em PDF.**

| Formato | Fidelidade | Quando usar |
|---|---|---|
| **.md** (Markdown) | Total — é o formato-fonte | Formato de trabalho. Round-trip perfeito: citações `[@chave]` continuam vivas, layout de página viaja dentro do arquivo (comentário invisível na 1ª linha). Legível em qualquer editor de texto. |
| **.html** | Total | Igual ao .md, mas com atributos `data-*` em vez de sintaxe pandoc. Bom para publicar na web. |
| **.docx** (Word) | Alta (via pandoc) | Entrega e colaboração. Fonte **Times New Roman 12pt** em todo o documento, **centralização e recuos** (capa, folha de rosto, recuo de 1ª linha) preservados, **quebras de página** reais e linhas em branco mantidas. Legendas e referências cruzadas viram **campos SEQ/REF nativos** (o Word renumera com F9), notas de rodapé/equações/revisão viram os recursos nativos. Citações viram texto formatado (mão única — quem edita no Word não as reativa). |
| **.odt** (LibreOffice) | Alta | Fonte **Times New Roman** (padrão do formato), **centralização, recuos da norma** (1ª linha 1,25 cm; natureza 8 cm), **quebras de página** e linhas em branco preservados via estilos nomeados. Recuo em valor fora do conjunto da norma não viaja (o ODF exige um estilo por valor). Legendas/crossrefs saem como texto fixo (campos ODF ainda não implementados). |
| **.rtf** | Boa | Compatibilidade com editores antigos: estrutura, quebras e linhas em branco, mas **sem fonte/alinhamento/recuo** (o RTF não tem canal para isso aqui). Para norma, prefira .docx, .odt ou PDF. |
| **PDF** | WYSIWYG | Só saída (botão **PDF** na barra). O que você vê nas páginas do editor é o que sai no PDF — a contagem e as quebras de página são as mesmas, por construção. |

Ressalvas conhecidas:

- **Layout por documento não sobrevive em .docx/.odt/.rtf** (o pandoc descarta
  os metadados): ao reabrir um desses, o formato de página/margens vêm das
  Configurações, não do arquivo. Em .md/.html o layout viaja junto.
- Documento com títulos numerados à mão (padrão "1 Introdução") dispara, ao
  abrir, a pergunta se você quer converter para numeração automática.

---

## Estudantes e acadêmicos (TCC, dissertação, artigo)

O fluxo completo, na ordem:

1. **Modelo** — `Layout ▸ Modelos ▾ ▸ ABNT (NBR 14724)`. Num documento vazio
   ele monta capa, folha de rosto, sumário e seções, e configura tudo:
   A4, margens 3/2cm, Times 12pt, entrelinha 1,5, justificado, e a numeração
   correta da norma — **páginas pré-textuais sem número; a Introdução
   (4ª página física) exibe "3"**, porque a capa não conta. Se você inserir
   páginas pré-textuais (resumo, listas), ajuste a numeração avançada no
   diálogo de cabeçalho/rodapé (duplo clique na margem da página, ou
   `Inserir ▸ ▤ Cabeçalho`): "mostrar a partir da página física N, numerada
   como M".
2. **Estilos do documento** — `Layout ▸ ¶A Estilos`: fonte/tamanho (em pt)/
   entrelinha/alinhamento/recuo por tipo de bloco (Parágrafo, Títulos 1–3,
   Citação, Legenda). Vale idêntico no PDF e viaja com o arquivo.
3. **Bibliografia** — `⚙ Configurações ▸ Bibliografia`: aponte o `.bib` do
   Zotero (ou CSL-JSON). Depois digite `[@` no texto para citar com
   autocomplete. Estilos inclusos: **ABNT, APA 7, Chicago, IEEE** (todos
   offline). O bloco **Referências** (inserido pelo starter ABNT, ou via
   menu `/`) se preenche sozinho com o que você citou.
4. **Figuras e tabelas** — insira pela aba `Inserir`; adicione **legenda**
   pelo menu `/` ("Legenda"). A numeração (Figura 1, Tabela 1…) é automática
   e renumera sozinha. **Referência cruzada** ("ver Figura 2") também pelo
   menu `/` — atualiza ao vivo se a figura mudar de número.
5. **Sumário e listas** — menu `/`: "Sumário", "Lista de Figuras", "Lista de
   Tabelas". Os números de página entram na impressão/PDF.
6. **Notas de rodapé** — `Inserir ▸ nota` (ou `/`). **Equações** — `$latex$`
   inline ou pelo `/` (KaTeX; viram OMML nativo no .docx).
7. **Numeração de títulos** (1, 1.1, 1.1.1…) — `Layout ▸ 1.2.3 Títulos`.
8. **Entrega** — `Salvar como… ▸ .docx` para o orientador (campos nativos:
   ele pode editar e renumerar no Word) e botão **PDF** para a versão final.

## Editores e revisores

- **Alterações rastreadas** — `✎ Revisão ▸ track changes`: inserções e
  deleções ficam marcadas; aceite/rejeite uma a uma no painel. No export
  .docx viram **revisão nativa do Word** (e vice-versa no import).
- **Comentários** — selecione o texto e comente pelo painel de Revisão;
  viram comentários nativos no .docx.
- **Versões** — `⏱ Versões`: salve versões nomeadas do documento e restaure
  qualquer uma (guardadas localmente, fora do arquivo).
- **Capítulos** — `☰ Capítulos`: navegação estrutural pelo documento.
- Impressão imprime "com marcações" (padrão do Word): inserções sublinhadas,
  deleções riscadas.

## Uso geral e escritório

- **Modelos prontos** — `Layout ▸ Modelos ▾`: Relatório técnico (Arial 11pt,
  rodapé "N de M"), Carta comercial, Artigo científico, APA.
- **Cabeçalho/rodapé** — `Inserir ▸ ▤ Cabeçalho`, `Layout ▸ ▤ Cab./Rodapé`
  ou **duplo clique na margem da página**: campos esquerda/centro/direita
  com marcadores `{page}`, `{pages}`, `{title}`, `{date}`, primeira página
  sem número e numeração avançada (ABNT). Vale para o documento (viaja com
  o arquivo).
- **Página** — `Layout`: Clássica (rolagem infinita) ou paginada
  (A4/A5/Carta/A3) com quebras reais no editor; margens por preset ou
  personalizadas; quebra manual pelo menu `/`.
- **IA local (opcional)** — painel `✦ IA`: aponte uma pasta de modelos
  `.gguf` (ex.: a do LM Studio) em ⚙, escaneie, inicie. Chat e ações sobre a
  seleção (resumir, reescrever, revisar), tudo em `127.0.0.1`.
- **Produtividade** — busca `Ctrl+F`, zoom `Ctrl+scroll`, modo foco `F11`,
  corretor ortográfico (pt-BR/pt-PT/en/es/fr em ⚙), contagem de
  palavras/páginas na barra de status, autosave, abas.

---

## Verificação manual dos recursos de norma (v0.14)

Três pontos que dependem do app desktop (Tauri) e de ferramentas externas —
rodar após mudanças em templates, fontes ou numeração:

1. **Citações de verdade** — `⚙ ▸ Bibliografia` apontando um `.bib` real →
   digitar `[@` num documento ABNT → a citação sai autor-data (ABNT) e a
   seção Referências aparece formatada no preview de impressão.
2. **Round-trip Word** — salvar o documento ABNT como `.docx` e abrir no
   Word/LibreOffice: fonte do corpo em **12pt** (não 9pt), "Figura 1 —"
   renumera com F9 (campo SEQ), referências cruzadas clicáveis (REF).
   Reabrir o .docx no LocalOffice: legendas/crossrefs continuam vivas, sem
   números duplicados.
3. **PDF impresso** — botão **PDF ▸ 🖨 Imprimir/PDF** num documento ABNT:
   páginas 1–3 (capa, folha de rosto, sumário) **sem** número; Introdução
   mostra **"3"** no canto superior direito; contagem de páginas do diálogo
   igual à da barra de status do editor.

O checklist geral de smoke (arquivos, editor, print, citações, IA) está em
[SMOKE-CHECKLIST.md](SMOKE-CHECKLIST.md).
