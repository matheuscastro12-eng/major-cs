# Design system "Broadcast Desk" · nova interface do Road to Major

O Road to Major é uma transmissão de CS. Placar, lower third, faixa AO VIVO e os
lados CT (azul) e T (âmbar) são a gramática de todos os modos. Este documento
diz o que usar e quando. A vitrine viva está em **`/design`**
(`src/pages/DesignScreen.tsx`): tokens com contraste medido, escala e todos os
primitivos, com troca de modo e prévia do tema claro.

Arquivos:

| Arquivo | Papel |
|---|---|
| `src/styles/tokens.css` | **Única** fonte de tokens semânticos. Único lugar com hexadecimal de cor. |
| `src/styles/tokens-legacy.css` | Mapa de transição: `--rtm-*`, `--em-*`, `--rtp-*`, `--ut-*`, `--dl-*`, `--dash-*` e os aliases sem prefixo (`--bg`, `--gold`…) apontam para os tokens. Código novo não usa estes nomes. |
| `src/styles/base.css` | Estilos globais: body, headings na escala, links, foco visível, seleção, scrollbars, movimento reduzido. |
| `src/styles/primitives.css` | Classes `.ds-*` dos primitivos. |
| `src/components/ds/` | Componentes React finos sobre os primitivos (`import { Button, Panel, … } from '../components/ds'`). |
| `scripts/test-design-tokens.mts` | Trava: contraste ≥ 4,5:1, escala com piso de 11px, nenhuma variável legada órfã, nenhuma camada legada redefinida fora do mapa, nenhum hex nos arquivos do DS. |

Ordem de import (`src/main.tsx`): tokens → tokens-legacy → base → CSS legado
das telas → **primitives por último** (ganha empate de especificidade).

---

## 1. Cor

### Superfícies (grafite-azulado, 4 degraus)

| Token | Uso |
|---|---|
| `--c-surface-0` | Fundo da página. Também o "poço" (input afundado, trilho de barra). |
| `--c-surface-1` | Painel (`Panel`, seção de tela). |
| `--c-surface-2` | Card dentro de painel, cabeçalho de painel, linha par de tabela. |
| `--c-surface-3` | Elevado: hover, input, cabeçalho de tabela, popover. |
| `--c-scrim` | Véu atrás de modal/sheet. |
| `--c-hover` / `--c-press` | Brilho sobreposto de hover/pressionado sobre qualquer superfície. |

Regra: cada nível de aninhamento sobe **um** degrau. Nunca ponha surface-1
dentro de surface-2.

### Linhas

`--c-line` para divisórias e bordas de card; `--c-line-strong` para borda de
input, painel em foco ou separação que precisa aparecer.

### Tinta

| Token | Uso |
|---|---|
| `--c-ink` | Texto principal, números, títulos. |
| `--c-ink-dim` | Texto secundário, descrição, rótulo de Stat. |
| `--c-ink-faint` | Metadado, legenda, placeholder. **Ainda legível** (≥ 4,5:1): não é cor de "desabilitado". |
| `--c-on-accent` | Texto sobre preenchimento de acento (botão primário, tag sólida). |
| `--c-on-achievement` | Texto sobre dourado. |
| `--c-on-strong` | Texto branco sobre a faixa AO VIVO. |

Desabilitado = `opacity: .5` no controle inteiro, nunca uma cor de tinta mais
apagada.

### Acento (sinal da ação primária)

`--c-accent` é o **sinal**: botão primário, aba ativa, link, foco, seleção,
barra de progresso. Um por tela, com parcimônia: se tudo é acento, nada é.

Derivados (recalculados onde o acento muda): `--c-accent-strong` (hover),
`--c-accent-deep` (preenchimento escuro), `--c-accent-soft` (fundo de tag/realce),
`--c-accent-line` (borda de realce).

O acento varia **por modo**, via `[data-mode]`:

| `data-mode` | Modo | Acento |
|---|---|---|
| (nenhum) | Hub, landing, Major rápido | teal de sinal |
| `rtp` | Road to Pro | teal ("The Desk" original) |
| `carreira` | Carreira | violeta |
| `ultimate` | Ultimate | rosa |
| `diario` | Diário | lima |
| `online` | Online | ciano |

O `App` marca `data-mode` no `<html>` conforme a tela, então modais portados ao
`body` herdam o acento. Um bloco local também pode marcar (ex.: cada card de
modo na Home tem o `data-mode` do seu modo).

### Significado fixo (não varia por modo)

| Token | Quando usar | Nunca usar para |
|---|---|---|
| `--c-achievement` | Conquista: título, troféu, carta rara/ícone, Fundador, recorde. | Botão comum, destaque genérico, "premium" de venda. |
| `--c-win` / `--c-loss` | Resultado: vitória/derrota, delta positivo/negativo, placar final. | Ação (botão "confirmar" não é verde). |
| `--c-draw` | Empate, neutro em resultado. | |
| `--c-warn` | Aviso, prazo, risco (moral baixa, contrato vencendo). | |
| `--c-epic` | Momento épico: clutch, ace, raridade épica. | |
| `--c-ct` / `--c-t` | Lado do CS: placar, round, economia, mapa tático. | Qualquer coisa que não seja lado. |
| `--c-live` / `--c-live-fill` | AO VIVO: ponto pulsante e faixa. | Erro (use `--c-loss`). |

Cada um tem `-soft` (fundo translúcido): `--c-win-soft`, `--c-loss-soft`,
`--c-warn-soft`, `--c-achievement-soft`, `--c-ct-soft`, `--c-t-soft`.
Para outra opacidade: `color-mix(in srgb, var(--c-win) 30%, transparent)`.

### Tema claro

Opção do jogador para o app inteiro (`data-theme="light"` no `<html>`, pelo
toggle da Carreira). **Nunca** imposto por um modo: o Ultimate deixou de ter
tema claro próprio (UX-02). Todo token tem par no claro com o mesmo contraste.

---

## 2. Tipografia

Três papéis, três famílias (carregadas no `index.html` com preload e
`display=swap`; nada de `@import` no CSS):

| Token | Família | Uso |
|---|---|---|
| `--font-display` | Oswald | Títulos de tela, placar, nomes em lower third, kicker em caixa-alta. Com restrição: nunca em parágrafo. |
| `--font-ui` | Inter | Tudo o mais: corpo, botões, rótulos. |
| `--font-num` | JetBrains Mono (tabular) | Números que se comparam: rating, dinheiro, estatística, placar de tabela, tempo. |

Escala de 6 degraus, **piso de 11px** (UX-09). Não existe texto menor que
`--fs-1`.

| Token | px | Uso |
|---|---|---|
| `--fs-1` | 11 | Legenda, caps com tracking (`--tracking-caps`). |
| `--fs-2` | 12 | Metadado, rótulo, cabeçalho de tabela. |
| `--fs-3` | 14 | Corpo denso ("Desk"): tabelas, painéis de gestão. |
| `--fs-4` | 16 | Corpo confortável; **todo input no mobile** (evita zoom do iOS). |
| `--fs-5` | 20 | Título de painel/seção (h3). |
| `--fs-6` | 28 | Título de tela (h1/h2), placar. |
| `--fs-display` | 36–64 fluido | Momento "Broadcast": sala, reveal, final. |

Entrelinha: `--lh-tight` (display), `--lh-snug` (títulos), `--lh-body` (corpo).
Os headings `h1..h4` já saem na escala pelo `base.css`.

**Proibido:** `fontSize` inline em JSX e tamanhos fora da escala em CSS novo.

---

## 3. Espaço, raio, sombra, motion

- **Espaço** em escala de 4: `--sp-1` (4) · `--sp-2` (8) · `--sp-3` (12) ·
  `--sp-4` (16) · `--sp-5` (20) · `--sp-6` (24) · `--sp-8` (32) · `--sp-10` ·
  `--sp-12` · `--sp-16`. Gutter lateral no mobile: `--sp-4`.
- **Raio:** `--rad-1` (4, tag/chip) · `--rad-2` (6, botão/input) · `--rad-3`
  (10, card/painel) · `--rad-4` (14, sheet/modal) · `--rad-pill`. `--notch`
  é o chanfro diagonal do scorebug (placar, lower third).
- **Sombra:** `--shadow-1` (painel), `--shadow-2` (card em hover, popover),
  `--shadow-3` (modal/sheet). No escuro a elevação vem mais do degrau de
  superfície que da sombra.
- **Motion:** `--dur-1` 120ms (hover/foco) · `--dur-2` 200ms (troca de estado)
  · `--dur-3` 320ms (entrada de sheet/modal) · `--dur-4` 600ms (momento
  broadcast). Easings: `--ease-out` (padrão), `--ease-in-out`, `--ease-snap`
  (só para "estalo" de conquista). `prefers-reduced-motion` zera animação no
  `base.css`; não reative.
- **Camadas:** `--z-sticky` < `--z-overlay` < `--z-sheet` < `--z-toast`.
- **Toque:** `--tap` (44px). Todo alvo clicável tem pelo menos isso em
  `pointer: coarse`.

---

## 4. Primitivos (`src/components/ds/`)

| Componente | Quando usar | Notas |
|---|---|---|
| `Button` | Toda ação. | `primary` = a ação da tela (uma só por contexto) · `secondary` = alternativa · `ghost` = ação terciária/ícone · `danger` = destrutiva (demitir, apagar save) · `achievement` = **só** resgatar/ver conquista. Tamanhos `sm`/`md`/`lg`. Hover e foco são CSS. |
| `Panel` | Seção de tela com título. | `tone`, `flush` (sem padding, para tabela), `actions` no cabeçalho, `headingLevel` para a hierarquia. |
| `Card` / `CardButton` | Item dentro de painel; `CardButton` quando o card inteiro é clicável (opção de escolha). | `selected` marca com o acento. |
| `Tag` | Rótulo de estado/categoria. | Tons: `neutral`, `accent`, `solid`, `win`, `loss`, `warn`, `achievement`, `ct`, `t`, `epic`. A cor segue o significado da seção 1. |
| `Badge` | Contador/novidade num ícone ou aba. | |
| `LiveBadge` | Indicador AO VIVO. | Único uso de `--c-live`. |
| `Tabs` + `TabPanel` | Alternar visões da mesma entidade. | Acessível (setas, Home/End, `aria-selected`). Não use para navegação entre telas. |
| `Table` | Lista de dados comparáveis (elenco, tabela de campeonato, ranking). | Densa estilo FM; números em `--font-num` alinhados à direita; `isMe` destaca a linha do jogador; `empty` para vazio. |
| `Stat` | Número com rótulo (rating, saldo, MMR). | Número tabular + rótulo `--c-ink-dim`; `delta` usa win/loss. |
| `Alert` | Mensagem de contexto na tela. | `info`, `success`, `warn`, `danger`. Erro diz o que houve e como resolver. |
| `EmptyState` | Lista/tela sem conteúdo. | Sempre com a ação que resolve o vazio. |
| `Modal` | Decisão que bloqueia no desktop. | No mobile prefira `Sheet`. |
| `Sheet` | Painel de detalhe/ação. | Bottom sheet no mobile, diálogo centrado no desktop. ESC, foco e trava de scroll vêm de `useOverlay`. |
| `InfoTip` | Explicação curta de um termo ou número. | **Substitui `title=`** (que não existe no toque). Tocável e com teclado. |
| `Skeleton` | Carregamento. | No formato do conteúdo final, não spinner genérico. |
| `ProgressBar` | Progresso até meta (XP, temporada, meta comunitária). | `role="progressbar"` com `valueText` legível. |
| `Scoreboard` | Placar de série/mapa. | Gramática de transmissão: times, placar, status (`live`/`final`/`upcoming`), lados CT/T. |
| `LowerThird` | Apresentar pessoa/momento (caster, MVP, contratação). | |
| `Toast` (`useToast`) | Confirmação passageira de ação. | O texto repete o verbo do botão ("Salvar" → "Salvo"). |
| `announce()` / `LiveRegion` | Resultado que precisa ser lido por leitor de tela. | Resultado de partida, recompensa. |

O `<Button>`/`<Panel>` de `src/components/ds.tsx` mantêm a API antiga
(`variant="gold"` vira `achievement`, `size="big"` vira `lg`) e renderizam os
primitivos. Código novo importa de `components/ds`.

---

## 5. Regras para as próximas ondas

1. **Nenhum hexadecimal fora de `tokens.css`.** Cor nova nasce lá, com par no
   tema claro e entrada no teste de contraste.
2. **Nenhum `fontSize` inline.** Use a escala via classe.
3. **Não use nomes legados** (`--rtm-*`, `--em-*`, `--rtp-*`, `--ut-*`, `--dl-*`,
   `--bg`, `--gold`…) em código novo. Ao reescrever uma tela (Onda B), troque as
   referências dela pelos `--c-*` e primitivos; quando nada mais usar um nome,
   apague-o de `tokens-legacy.css`.
4. **Dourado é conquista.** Se não é título, raridade, recorde ou Fundador, não
   é dourado. (O alias legado `--gold` já aponta para o acento, não para o
   dourado.)
5. **Verde/vermelho é resultado**, não ação nem decoração.
6. **Um acento por tela**, e ele é do modo. Não crie "acento secundário".
7. **Foco visível sempre** (contorno de acento do `base.css` ou `--focus-ring`); nunca `outline: none` sem
   substituto.
8. **Toque:** alvo ≥ 44px em `pointer: coarse`; sheet no lugar de modal no
   mobile; `InfoTip` no lugar de `title=`.
9. **Duas marchas, uma paleta:** "Broadcast" (grande, `--fs-display`, Oswald,
   motion `--dur-4`) só em momentos; "Desk" (denso, `--fs-3`, tabela) na gestão.
10. Antes de commitar: `npx tsx --test scripts/test-design-tokens.mts`.


---

## 6. Shell universal (a "nova interface", set/2026)

Uma interface só para o jogo inteiro (`src/components/ds/shell/`, estilos em
`src/styles/shell.css`). Referência visual aprovada: fundo marinho, dourado da
marca, Football Manager como referência de UX.

| Peça | O que é |
|---|---|
| `GameShell` | Trilho de modos (74px) + sidebar do modo (216px) + topbar + subnav + conteúdo. Props: `mode`, `identity` (título, subtítulo, escudo, cores do clube), `nav` (grupos estilo FM), `active`/`onNav`, `tabs`/`activeTab`/`onTab`, `next` (CONTINUAR), `meta`, `bell`, `tools`, `search`, `sideWidget`, `variant` (`full` · `focus` sem sidebar · `immersive` só a barra, sem saídas). |
| Trilho de modos | Carreira, Road to Pro, Ultimate, Draft, Diário, Online; escudo no topo leva ao Início; Avisos e "Você" (conta, densidade, tema, atalhos, idioma) no pé. O App entrega a lista via `ShellProvider`. |
| Sidebar do modo | "ROAD TO MAJOR", cartão do modo, grupos com título em caixa-alta, divisória, recolhíveis (lembra por modo) com contador quando fechados, item ativo em pílula dourada, badge dourado, widget de próximo evento no pé. |
| CONTINUAR | Botão dourado com o verbo (CONTINUAR/JOGAR/COMEÇAR) e o que vem a seguir ("Partida vs SHIN · MD1"). `pending` lista pendências; as `blocking` levam até elas em vez de avançar. Atalho: espaço. |
| Paleta de comandos | ⌘K / Ctrl+K / "/": seções, abas, modos, comandos globais e a busca do modo (jogadores, times). |
| Peek de jogador | Qualquer elemento com `data-peek="<ref>"` abre o cartão rápido (OVR, função, 6 atributos 1–20, forma) no hover ou segurando o dedo. Cada modo registra o resolvedor com `usePeekResolver` (`peekFromPlayer` monta a partir de um `Player`). |
| Densidade | Compacta/confortável em `[data-density]` no `<html>` (`--row-h`, `--pad-panel`). |
| Celular (< 1024px) | Topo compacto com menu (gaveta com modos e seções), tab bar de 4 seções + Menu e CONTINUAR fixo acima dela. |

Primitivos novos: `Panel` com `icon` (ícone dourado no cabeçalho), `Table` com
ordenação (`sort`), visões de colunas (`views` + `view`), `tall` e `selected`,
`Segmented` (pílulas: Geral · Atributos · Contratos · Desempenho), `Ovr` (selo
dourado), `Bar`, `RoleChip`/`Chip`, `Avatar` com anel da função, `AttrValue`
(1–20 pintado por faixa, tokens `--c-attr-1..5`).

Cores: `--c-brand` (dourado da estrela) é a marca e o acento de TODOS os modos
na nova interface; `--c-achievement` continua sendo conquista. `--c-topbar*`,
`--c-rail`, `--c-shell*`, `--c-panel-head`, `--c-line-soft`, `--c-crest-*` e
`--c-role-*` nasceram com o shell. Tipografia: Oswald (display), Barlow
Condensed (`--font-title`, títulos de painel), Barlow (UI e números tabulares).

`src/styles/skin.css` aplica a forma do painel novo às telas legadas dentro do
shell (`.dash-card`, `.rtp`, `.ut-root`, `.rtm-daily`) e corrige o sticky
(`body.career-dash` com `overflow-x: clip`).
