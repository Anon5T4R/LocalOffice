# Real Page Breaks (Google Docs-style)

## O que é

Em vez de ghost pages (clone HTML espelhado) ou contínuo sem páginas,
cada página do documento é um **editor ProseMirror independente**,
sincronizado com os demais. O usuário vê e edita páginas reais — como
no Google Docs — sem DOM oculto, sem fantasmas, sem bugs de clipping.

## Arquitetura

```text
┌──────────────────────────────────────┐
│  PageManager (state global)          │
│  - lista de páginas (Page[])          │
│  - split/merge                        │
│  - página atual + cursor              │
├──────────────────────────────────────┤
│  Page 1  │  Page 2  │  Page 3  ...   │
│  Editor  │  Editor  │  Editor         │
│  (tipTap) │  (tipTap) │  (tipTap)    │
└──────────────────────────────────────┘
```

### Componentes

| Camada | Responsabilidade |
|---|---|
| `PageManager` | State: lista de páginas, fluxo de conteúdo entre elas |
| `PageEditor` | Instância ProseMirror de UMA página |
| `PageBreakNode` | Nó ProseMirror que marca o fim de uma página |
| `SyncEngine` | Mantém coerência: deletar conteúdo no fim da página N move pra página N+1 |

## Implementação

### 1. `PageManager` (hook central)

```ts
interface Page {
  id: string;
  doc: JSONContent;  // conteúdo DESTA página
  meta: { pageNumber: number };
}

function usePageManager() {
  const [pages, setPages] = useState<Page[]>([{ id: newId(), doc: EMPTY_PAGE, meta: { pageNumber: 1 } }]);
  // split(pageId, pos): quebra a página pageId na posição pos
  // merge(pageId): funde pageId com pageId+1
  // moveUp(fromPageId, fromPos, toPageId, toPos): move conteúdo
  return { pages, split, merge, moveUp };
}
```

### 2. `PageEditor` (componente por página)

Cada página é uma instância independente de `useEditor` do TipTap,
com seu próprio `content` e `onUpdate`. As extensões são as mesmas
(shared). O `onUpdate` de cada página:

1. Verifica se o conteúdo estourou o limite da página
2. Se sim, chama `split()` no PageManager e move o excesso pra
   página seguinte
3. Se a página anterior encolheu, puxa conteúdo da página seguinte
   (`moveUp`)

### 3. `PageBreakNode` (extensão ProseMirror)

Nó invisível que define onde uma página termina. Renderiza como
um separador visual (gap cinza, tipo Google Docs). O usuário pode
inserir/remover manualmente (quebra manual). O `PageManager` também
move conteúdo neste nó.

### 4. SyncEngine (lógica de fluxo)

O coração da abordagem. Toda alteração no editor de uma página
dispara uma verificação:

```ts
function onPageUpdate(pageId: string, editor: Editor) {
  const height = editor.view.dom.scrollHeight;
  const maxHeight = printableHeightPx;  // A4 - margens
  if (height > maxHeight) {
    // Encontra o ponto de quebra ideal no conteúdo
    const splitPos = findBreakPoint(editor, maxHeight);
    if (splitPos !== null) {
      // Move o excesso para a próxima página
      const excess = extractContent(editor, splitPos);
      pageManager.pushContent(pageId + 1, excess);
    }
  }
  // Se a página encolheu e a próxima tem conteúdo, puxa
  if (height < maxHeight - threshold) {
    const nextPage = pageManager.getPage(pageId + 1);
    if (nextPage && nextPage.hasContent()) {
      const pulled = nextPage.popContent(maxHeight - height);
      editor.commands.insertContentAt(editor.state.doc.content.size, pulled);
    }
  }
}
```

### 5. Layout / UI

```tsx
function PaginatedEditor() {
  const { pages } = usePageManager();
  return (
    <div className="pages-scroll">
      {pages.map((page) => (
        <div key={page.id} className="page-sheet">
          <PageEditor page={page} />
        </div>
      ))}
    </div>
  );
}
```

Cada `.page-sheet` é um container com as dimensões da página (A4/A5/etc)
e `overflow: hidden`. O editor interno é limitado visualmente pelo
container, mas o `scrollHeight` do editor interno determina se o
conteúdo precisa ser movido.

### 6. Estado global

Diferente do modelo atual (um editor + ghosts), aqui CADA PÁGINA
tem seu próprio `Editor` TipTap. O estado global do documento é a
concatenação do estado de todas as páginas. Para operações como
"salvar" e "exportar", o `PageManager` serializa todas as páginas
como um único documento.

```ts
function serializeAll(): JSONContent {
  const merged = { type: "doc", content: [] };
  for (const page of pages) {
    merged.content.push(...page.doc.content);
  }
  return merged;
}
```

## Comparação com os modelos

| Aspecto | Ghost Pages (antes) | Contínuo (agora) | Real breaks (proposto) |
|---|---|---|---|
| DOM duplicado | Sim (N clones) | Não | Não |
| Páginas fantasmas | Sim | Não | Não |
| Decorações do editor | Perdidas no clone | Preservadas | Preservadas |
| Performance | O(n²) DOM | O(n) | O(n) |
| Edição entre páginas | Não rola | Scroll infinito | Quebras reais |
| Visual de páginas | Sim (clonadas) | Parcial (margens) | Exato |
| Complexidade | Média | Baixa | Alta |

## Riscos

1. **Sincronização**: Se o `split()` e o `pushContent()` concorrerem com
   `onUpdate`, pode perder conteúdo. Precisa de fila ou transação.
2. **Cursor/foco**: Trocar de página exige gerenciar qual editor tem
   foco. `useEffect` no pageManager + `editor.commands.focus()`.
3. **Desfazer/Refazer**: Cada editor tem seu próprio histórico.
   `undo()` não atravessa páginas. Solução: histórico global no
   PageManager, ou aceitar que undo é por página.
4. **Seleção entre páginas**: Proibido. Usuário não pode selecionar
   texto que cruza a quebra de página. Clicar/arrastar no fim de uma
   página move o cursor pro início da próxima (como Google Docs).

## Milestones

1. **Prova de conceito** (~2 dias): 2 editores lado a lado, split
   manual via botão, merge manual
2. **Split automático** (~3 dias): `scrollHeight` + `findBreakPoint`
   + mover conteúdo
3. **Merge automático** (~2 dias): conteúdo puxado da página seguinte
   quando a atual encolhe
4. **Quebras manuais** (~1 dia): PageBreakNode inserível pelo usuário
5. **Persistência** (~1 dia): serialize/deserialize do PageManager
6. **Undo global** (~3 dias, opcional): histórico centralizado
7. **Polimento** (~2 dias): focus, scroll, animações de transição

**Total estimado**: 10-12 dias de desenvolvimento focado.
