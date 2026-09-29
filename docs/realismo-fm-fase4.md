# Realismo FM — Fase 4: o mundo (circuito real, juventude, editor de base)

No master: fase 1 (atributos reais, motor v2 calibrado, cena set/2026), fase 2 (treino, tática, comissão — `engine/gestao`, save v28) e fase 3 (vestiário, contratos, IA de mercado — `engine/clube`, save v29). Princípio: **a simulação decide, a interface mostra**, tudo visível como no FM, telas no padrão da interface universal (`components/ds/shell`, tokens em `styles/tokens.css`). O nome do jogo é **Road to Major** (nunca "MAJOR//CS" em texto visível).

O que já existe e esta fase APROFUNDA E UNIFICA (não duplique — evolua): `data/tournaments.ts` (pools de nomes reais), `engine/league.ts`, `engine/swiss.ts`, VRS em `engine/career/progress.ts`/`ratings.ts`/`newsroom.ts`, `engine/career/signings.ts` (RegenPlayerId com geração), `engine/career/academyLeague.ts`, `engine/transferAI.ts` + `engine/clube/mercadoIA.ts`, envelhecimento/progressão em `engine/career`, `api/bo3-edits.ts` (overrides do admin).

## Contrato (branch `fase4/base`)
- `src/engine/mundo/model.ts`: `CalendarEvent`, `WorldEventResult`, `VrsEntry`, `YouthIntakeLog`, `MundoState`, `CustomDatabase`.
- Esqueletos: `mundo/circuito.ts` (`defaultCalendar`, `defaultResults`, `defaultVrs`), `mundo/juventude.ts` (`defaultNewgens`, `defaultIntake`), `mundo/editor.ts` (`defaultDatabaseId`).
- Save da Carreira **v30** (`mundo/mundoMigration.ts`): grava `save.mundo`. Nenhuma frente sobe a versão; campo novo é opcional dentro do bloco.
- Teste do contrato: `scripts/test-mundo-contract.mts`.
- **Neutralidade**: save migrado continua jogável e com a mesma curva de dificuldade (`scripts/measure-neutralidade.mts` é a régua). Mundo equilibrado: OVR médio do top 20 da IA estável em 10 splits (hoje infla ~+4 — a frente K conserta).

## Frentes
### J. Circuito real (`fase4/circuito`)
- **Calendário por temporada** (`mundo.calendar`): tiers S/A/B (1/2/3), ligas, suíço, GSL, playoffs, **qualifiers abertos e fechados**, **ciclo do Major** (RMR/qualificatório regional → Major com Stage 1/2/3 suíço + playoffs), convites diretos pelo VRS, premiação real por tier, nomes reais de `data/tournaments.ts`.
- **VRS real** (`mundo.vrs`): fórmula tipo Valve (fatores de premiação, rede de adversários batidos, LAN; decaimento por idade do resultado), substitui/unifica o VRS atual; tela de ranking mostra a composição dos pontos.
- **LAN × online**: evento LAN aplica peso do oculto `bigMatch`/pressão no motor (pequeno, calibrado; online não). **Bootcamp** antes de LAN grande (custo, +entrosamento), **visto** (chance pequena de negação por região → stand-in), **pausas** entre splits.
- **Mundo em segundo plano**: eventos que você não joga são simulados (rápido, pelo motor em modo resumo ou modelo de força calibrado) e geram `mundo.results` + manchetes na caixa de entrada; quem ganha o quê aparece no histórico do evento.
- Tela: "Calendário" (agenda da temporada, filtros por tier/região, sua rota até o Major) e "Circuito" (evento: formato, participantes, chave/resultado, premiação, VRS).

### K. Juventude e envelhecimento (`fase4/juventude`)
- **Geração anual de jovens** (newgens) por região (`MacroRegion`), quantidade e qualidade proporcionais à força da cena (Europa/CIS mais, África/Oceania menos), distribuição realista de PA (maioria 90–130, raros 160+), nomes/nicks por país plausíveis, atributos coerentes com a função (via `deriveAttrs`/modelo de atributos da fase 1), persistidos em `mundo.newgens` e `mundo.intake`.
- **Academias**: clubes com academia (`academyLeague.ts`) recebem mais/melhores; seu clube vê a sua geração (tela "Juventude" com o relatório do olheiro).
- **Aposentadoria**: por idade/declínio/motivação; alguns viram treinador/analista no pool da comissão (fase 2 `staff`).
- **Recalibrar envelhecimento**: curva de pico ~22–26, declínio >28, físicos (reflexos) caem antes dos mentais; **medir e corrigir a inflação do top 20** (≈ +4 em 10 splits hoje) — meta: top 20 médio estável (±1) com renovação de nomes.
- Tela: "Juventude" (geração do ano, promessas, PA estimado pelo olheiro com incerteza) + aposentadorias nas notícias.

### L. Editor de base (`fase4/editor`)
- Editor estilo FM no jogo: jogadores (28 atributos, ocultos, CA/PA, função, idade, time), times (nome, tag, cores, região, elenco, técnico), adicionar jogador/time.
- `CustomDatabase` salva fora do save (storage próprio, ex.: `localStorage 'rtm-db-custom-v1'` + exportar/importar JSON validado); nova Carreira escolhe a base (oficial ou customizada) e grava `mundo.databaseId`. Carreira já começada não muda de base.
- Respeitar os overrides do admin (`bo3_edits`): a base oficial = dados + edits do admin; a customizada aplica por cima.
- Validação forte (faixas 1–20, CA coerente, elenco com 5+ jogadores, ids únicos) — base inválida nunca quebra a Carreira.
- Tela: "Editor" acessível do menu inicial/criação de Carreira, padrão da interface universal, busca/filtros, desktop e mobile.

## Regras comuns
- Só na sua worktree/branch (a partir de `fase4/base`), commit por marco, sem push/PR/merge. Não edite arquivos de outra frente sem necessidade; interfaces entre frentes: registre em "Mudanças de contrato" e no relatório.
- Calibração (`test-engine-calibration`) e neutralidade continuam verdes.
- Portões no fim: `npm run lint` (0), `npx tsc -b`, `npm test`, `npm run test:sim` (também `MATCH_ENGINE=v1`), `npm run build`. Um comando pesado por vez.
- Telas em 1440×900 e 390×844 (Playwright em `/private/tmp/claude-501/-Users-matheuscastro-orca-major-cs/3774674b-38bb-4228-8c79-6903e36bc699/scratchpad/video/cap/node_modules`, `chromium.launch({ channel: 'chrome' })`, porta própria) em `/private/tmp/claude-501/-Users-matheuscastro-orca-major-cs/3774674b-38bb-4228-8c79-6903e36bc699/scratchpad/fase4-shots/<frente>-*`; confira você mesmo. Textos novos com en/es em `career-strings.ts`.

## Mudanças de contrato
### Frente L (editor), branch `fase4/editor`
- `CustomDatabase.playerEdits`: `Record<string, CustomPlayerEdit>` (era `Partial<Player>`). `CustomPlayerEdit` =
  `nick`, `name`, `country`, `role`, `role2` (`null` remove), `age`, `attrs` (PlayerAttrs completos). Os 5 números
  legados nunca são editados direto: saem dos atributos (`withAttrs`), CA sempre recalculado com `caFromAttrs`.
- `CustomDatabase.teamEdits`: `Record<string, CustomTeamEdit>` (era `Partial<TeamSeason>`). `CustomTeamEdit` =
  `team`, `tag`, `country` (define a região via `macroRegionOf`), `colors`, `teamwork`, `coach`, `roster` (ids, na
  ordem: 5 primeiros titulares). O elenco dos times NOVOS também mora em `teamEdits[id].roster`; em `addedTeams`
  o `players` fica vazio. Quem sai de um elenco sem destino vira free agent (`__free__`).
- `CustomDatabase.updatedAt?` (opcional). Ids novos: `cdb_*` (base), `cdb_p_*` (jogador), `cdb_t_*` (time).
- `MundoState.database?: CustomDatabase | null` (opcional): cópia CONGELADA da base escolhida na criação da
  Carreira. `mundo.databaseId` continua sendo a fonte de qual base foi usada.
- `CareerSave.mundo?: MundoState` declarado em `CareerScreen.tsx` (as outras frentes leem daí).
- Para as outras frentes: a base da Carreira agora é `rawBase`/`editedBase` no `CareerScreen` (oficial ⇒ os
  mesmos objetos de antes). Quem precisar da lista de times/jogadores da base dentro da Carreira deve usar essas,
  não `CS2_REAL_2026` direto (senão times/jogadores novos da base customizada não aparecem). Jogador movível pelo
  mercado da IA = `movableIds` (era `BASE_PLAYER_IDS`).

## Frente L (editor): o que ficou
- Motor puro em `src/engine/mundo/editor.ts`: `validateDatabase` (faixas 1–20, PA 1–200, idade 15–45, CA
  recalculado, PA ≥ CA, ids únicos e no formato, elenco editado/novo com 5–10, ninguém em dois elencos, limites
  de quantidade), `applyCustomDatabase`/`applyCustomPlayer`, `import/exportDatabaseJson`, helpers de edição
  (`movePlayer`, `setRoster`, `addPlayer`, `addTeam`…), `resolveCareerDatabase`.
- Limites: importação ≤ 1 MB (recusada antes do parse), base ≤ 256 KB serializada, 5 bases no aparelho, 300
  jogadores novos, 48 times novos, 2.000 edições de jogador, 400 de time. Chaves `__proto__`/`constructor` são
  descartadas; lookups por `Map`.
- Storage: `rtm-db-custom-v1` (`src/state/customDb.ts`), sempre em try/catch; cota cheia avisa e sugere exportar.
- **Base que some (decisão)**: a Carreira congela a base no save (`mundo.database`), como o FM carrega a base no
  início — editar/apagar a base depois não muda a Carreira. Se a cópia faltar ou não validar, usa a do storage
  com o mesmo id (e congela a partir dali); sem nenhuma, segue na OFICIAL e avisa uma vez (toast). Custo: até
  256 KB a mais no save de quem usa base customizada (0 para quem usa a oficial).
- Ordem das camadas: dados (bo3-2026 + atributos da fase 1) → edições do admin (`bo3_edits`) → base customizada.
  No `findSigning`, a customizada é reaplicada depois de `applyBo3PlayerEdit` para vencer o admin.
- Telas: `/editor` (menu inicial: seção "Projeto" e card "Editor de base"; paleta ⌘K; "Abrir editor" na
  fundação da Carreira). A escolha da base fica no topo dos Desafios e do "Assumir organização" e só vale antes
  de fundar/assumir.
- Testes: `scripts/test-mundo-editor.mts`.
