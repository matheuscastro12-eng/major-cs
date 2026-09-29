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
### Frente K (juventude) — `fase4/juventude`
- `mundo/model.ts` (só campos OPCIONAIS, save continua v30):
  - `YouthIntakeLog.origin?: Record<playerId, 'user' | idDoClubeComAcademia>` — de onde saiu cada jovem.
  - `MundoState.seed?` (semente estável das levas), `MundoState.newgenAttrs?: Record<playerId, string>` (28 atributos + ocultos + CA/PA empacotados, ≈45 bytes; `juventude.ts#packAttrs/unpackAttrs`) e `MundoState.retirees?: WorldRetiree[]` (aposentados recentes do mundo, últimos 60; tipo novo `WorldRetiree`).
  - `mundo.newgens[id]` guarda o `Player` SEM `attrs` (os 5 números coerentes com eles). **Leia sempre por `newgenPlayer(mundo, id)` / `newgenList(mundo)`**, que devolvem o jogador COM atributos.
- `defaultNewgens`/`defaultIntake` continuam neutros (a migração não pode importar a base bo3); a leva do ano corrente nasce na primeira abertura da Carreira (`ensureYearIntake`, efeito no CareerScreen) e as seguintes no fechamento do split (`tickJuventude`).
- Ids de jovem: `ng.<split de estreia>.<idade na estreia>.<região>.<n>` (`newgenId`/`parseNewgenId`/`isNewgenId`/`newgenAge`). O relógio de idade está no id (como o regen): `aiAgeOf` e `effectiveAge` já leem.
- Jovens entram no mundo da IA pelo `__free__` da base (`withNewgens(base, mundo, exclude)` em `juventudeMundo.ts`); `save.moves` os leva aos clubes. `movableIdsWith(mundo)` substitui `BASE_PLAYER_IDS` como `movableIds` do mercado. `applyAiAging` não envelhece jovem (ele evolui atributo a atributo no fechamento).
- `mercadoIA.ts` · `WorldTickArgs.affinity?: (buyerId, p) => number` (opcional, somado ao score da escolha): o clube-pai prefere o jovem da própria academia (`youthAffinity`).
- `aiWorld.ts` · curva recalibrada: `evoDelta` (tabelas `AI_GROWTH_BY_AGE`/`AI_DECLINE_BY_AGE`, longevidade `aiLongevity`), `aiPotentialOvr` (teto da idade comprimido no topo da escala, `AI_POT_TOP`/`AI_POT_SPAN`), regen mira o nível da vaga, `aiRetireAge(pid, ovr?)` (idade + nível + motivação, 29–37) com carência de 2–4 anos para o veterano que já passou da idade no início da Carreira.
- CareerScreen: `CareerSave.mundo?: MundoState` (as outras frentes adicionam a mesma linha: conflito trivial), `playerPotentialOvr` = `aiPotentialOvr` (mesma régua da IA; jovem gerado usa o PA dele), `HubTab 'youth'` + item "Juventude" em Mercado.
- Comissão (`StaffTab`): o mercado de staff recebe também `retireeStaffSources(mundo)` (aposentados do mundo que viraram técnico/analista/auxiliar).
- Para a frente J (circuito): as aposentadorias e a "nova geração" já saem como manchetes da caixa de entrada (`cat: 'scene'`/`'scout'`); o tick da juventude roda DEPOIS da janela de pré-temporada, nos dois fechamentos de split.

## Resultados medidos (frente K)
`npx tsx scripts/measure-mundo-10-splits.mts 10` (mundo sem o usuário, pipeline da Carreira: aging + mercado da IA + juventude). Travado em `scripts/test-juventude.mts` (top 20 dentro de ±1 do início em TODOS os splits, renovação ≥ 30%, top 5 e 21º-40º sem colapso, bloco de jovens < 64 KB).

| | top 20 split 1 | top 20 split 11 | pior desvio | top 20 split 31 |
|---|---|---|---|---|
| antes (curva antiga, sem jovens) | 82,5 | 86,8 (+4,3) | +4,3 | — |
| depois (curva nova + jovens) | 82,5 | 83,2 (+0,7) | +0,8 | 81,8 (−0,7) |

- Renovação de nomes no top 20: 53% dos titulares do top 20 no split 11 não estavam lá no split 1 (85% no split 31); jovens gerados titulares no top 20: 0 até o split 11, ~24 no split 31.
- Distribuição de PA da leva (1.800 jovens, 40 anos): < 90: 9%; **90–130: 69%**; 131–159: 18%; **160+: 3,7%**. Por região (média de PA / 160+ por ano): Europa 119 / 0,7; CIS 120 / 0,4; Américas 114 / 0,3; Ásia 108 / 0,1; Oceania 110 / 0,15; África 101 / 0,03. ~58 jovens por ano (44 da cena + 11 academias + 2 da sua base).
- Tamanho no save: bloco de jovens 13,6 KB no ano 1, **41,6 KB após 10 splits** (164 jovens vivos, 36 contratados), 92 KB após 30 splits (349 vivos, 207 contratados; teto de 150 jovens sem clube). Save real de teste: 72 KB (split 1) / 118 KB (split 10).
- Calibração (`test-engine-calibration`) verde; neutralidade (`measure-neutralidade.mts 150`): 29,4% → 29,9% (+0,4 ± 0,8 pp).
- Efeito na dificuldade: a IA não infla mais ≈ +4 de OVR no top 20 ao longo da Carreira — splits avançados ficam um pouco menos duros que antes (era o bug). Jovens do SEU elenco com OVR alto também sobem menos (mesma régua de potencial da IA); prospectos (OVR ≤ 70) mantêm o espaço inteiro.

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

### Integração K × L (`fase4/integracao`)
- Base do mundo da Carreira = `worldBaseFor(save, editedBase)`: oficial + edições do admin + base customizada
  (congelada) + jovens gerados sem clube no `__free__`. `worldBaseFor` passou a receber a base (não mais as
  edições do admin). `buildAiWorld`, `currentFreeAgents`, `agedFreeAgents` (mercado da IA e stand-ins) e o
  `tickJuventude` usam essa composição.
- Movíveis do mercado: `movableIdsWith(mundo, baseMovable)` — `juventudeMundo.movableIdsWith` ganhou o 2º
  parâmetro opcional (movíveis da base da Carreira; padrão `BASE_PLAYER_IDS`).
- `signingDrift(player, split, youthDebut, base)`: jovem gerado → 0; regen procura a origem na base da Carreira.
- `MundoState` tem os campos da K (`seed`, `newgenAttrs`, `retirees`) e o `database` da L.
- Teste: `scripts/test-mundo-integracao.mts` (base customizada + jovens juntos na Carreira).
### Frente J (circuito) — `fase4/circuito`
Tudo opcional; nenhuma versão nova de save (continua v30).
- `CalendarEvent` ganhou `qualifier?: 'open' | 'closed'`, `venue?`, `host?` (país-sede ISO), `etapa?`, `slot?` (t1, t1-alt, t2, t2-alt, t3, t3-sa, t3-eu, t3-asia). Ids: `ev:<split>:<etapa>:<slot>`, `q:…` (qualificatório, `qualifiesTo` = o evento), `rmr:<split>:<europe|americas|asia>`, `major:<split>` (`parseEventId`).
- `WorldEventResult` ganhou `name?`, `tier?`, `kind?`, `lan?`, `prizePool?` (USD real — o bounty do VRS), `t?` (tempo absoluto em etapas, `etapaTime`/`majorTime` — a idade no VRS), `field?` (tamanho do field; `placements` pode estar podado), `names?` (não usado ainda). O usuário aparece como `teamId: 'user'`.
- `VrsEntry` ganhou `factors?: { prize, network, lan }` (0–1), `rank?`, `prev?` (pontos da publicação anterior). `history` guarda as 2 maiores contribuições.
- `MundoState` ganhou `vrsAt?` (tempo da última publicação), `visa?` (vistos negados do evento em curso), `qualifiers?` (qualificatórios que você disputou na etapa), `bootcamp?` (bootcamp feito pro evento em curso).
- `mundo.calendar` gravado = agenda do SPLIT CORRENTE (+ qualificatórios) + o ciclo do Major da temporada (~8 KB); a temporada inteira é função pura (`buildSeasonCalendar(season)`), as telas regeneram. `defaultCalendar(save)` preenche na migração v30; resultados e VRS são semeados no primeiro render (`seedWorld`, precisa da base de times — como os contratos da fase 3).
- `mundo.results`: janela do VRS (6 etapas) com o field inteiro; mais velho que isso só o pódio (+ você) por mais ~12 etapas (`pruneResults`).
- Motor: `MapSimOpts.pressure?: number` (0–1; LAN 0,35, Major/RMR 0,5, `bigMatch` = 1) pesa o oculto `bigMatch` no v2 (v1 ignora; ausente/0 = bit a bit o de antes). `League.pressure?` e `Tournament.pressure?` levam o peso pras séries da IA (`resolveGSLRound`, `simulateAiSeries`); `MatchScreen` ganhou a prop `pressure`.
- `engine/career/progress.ts`: saíram `applyCareerVrsDecay`, `aiRollingVrs`, `aiSplitGain` (o VRS rolante do jogador e o sorteado da IA). `save.vrs` passa a espelhar os pontos do usuário no ranking unificado (`mundo.vrs.user.points`); `SplitRecord.vrs` = a contribuição do evento nos seus pontos.
- `data/tournaments.ts` ganhou `EVENT_META`/`eventMeta` (movidos do CareerScreen) e `venueHost(venue)`.
- Para K/L: as funções do circuito recebem a base de times por parâmetro (`buildEtapaEvents(pool, …)`, `seedWorld({ pool, … })`, `majorFieldFromVrs(vrs, pool, …)`); na Carreira o pool é `oppEra`/`currentEra`. `tagOfTeam`/`teamLite` caem em `CS2_REAL_2026` só pra time que saiu do mundo — trocar por `worldBase` na integração.

## Frente J · circuito real (feito)
- **Calendário** (`engine/mundo/circuito.ts`): 4 splits × 3 etapas × 8 eventos (T1, T1-alt, T2, T2-alt, T3 mundial + SA/EU/Ásia) com nomes reais, qualificatório FECHADO nos T1 e ABERTO nos T2, pausas (1 semana; 3 depois do Major) e o ciclo do Major (RMR Europa 4 vagas, Américas 2, Ásia-Pacífico 2 → Stage 1/2/3 suíço + Champions Stage). Sede real → LAN × online; qualificatório sempre online; RMR/Major LAN.
- **Field**: o MESMO de antes, time a time (faixas de força; dificuldade intacta — travado em `test-circuito-calendario`); o VRS decide quem é convidado e quem veio do qualificatório. Sua rota: seu tier, um abaixo, um acima por convite (VRS ≤ 20 pro T1, ≤ 44 pro T2) ou qualificatório (fechado: VRS ≤ 48, 1 MD3; aberto: MD1 + MD3). Um qualificatório por etapa; cada série conta como semana de treino.
- **VRS** (`engine/mundo/vrs.ts`): premiação real (45%), rede de adversários batidos (35%), LAN (20%), 10 melhores resultados, normalização pelo líder (raiz em premiação e rede), peso cheio até 1 etapa e zero em 6. Distribuição por posição calibrada na régua antiga (patrocínios/prestígio leem os mesmos números): #1 2162→2119, #8 972→1107, #16 701→653, #32 538→444, #64 208→150 (12 splits, `measure-circuito`). Força × ranking (Spearman) 0,78; o top 10 troca 1–4 times por split.
- **Progressão (mudança medida, não neutra)**: com o VRS por resultado, campeão de tier 2 encosta no top 32 (como no VRS real). Time de força 84 saindo do tier 3 chega ao tier 1 no split ~2,3 (antes ~7,7) e joga ~2,8 dos 3 Majors em 12 splits (antes ~0,3, porque agora tem o RMR); força 80: tier 1 no split ~7,5 (antes nunca). A dificuldade das PARTIDAS não muda (mesmo field; neutralidade da fase 2: +0,4 ± 0,8 pp em 150 temporadas).
- **Major pelo VRS**: 1–8 Stage 3, 9–16 Stage 2, 17–24 Stage 1, RMR regional pros próximos 16 de cada região. Cair no RMR = sem Major (objetivo "Major" falha, prêmio do RMR). O resto do Major (outros RMRs, stages antes da sua entrada, o que falta se você cair) roda em segundo plano e vira resultado do mundo.
- **LAN**: pressão pequena no oculto bigMatch (bigMatch 18 × 5: +6,8 pp de vitória de mapa em LAN, +16,8 pp na final; time médio: LAN − online = +0,3 pp). **Visto**: risco por região (CIS→Américas 7%, Ásia→Europa 3,5%, Europa→Américas 0,8%…), no máximo um por evento → stand-in pela cadeia de lesão. **Bootcamp**: antes de LAN, 35–60 mil (+40 mil fora do continente), +química dos titulares, +familiaridade nos 3 mapas do plano, +moral, condição.
- **Mundo em segundo plano** (`engine/mundo/mundoSim.ts`): modelo de força calibrado contra o motor (logística 0,15/ponto por mapa; MD3 Δ0 50/53%, Δ+4 79/76%, Δ+8 91/89% modelo/motor). ~0,6 ms por etapa inteira + publicação do VRS; Major completo ~1 ms. Manchetes (campeões T1, zebra, resumo T2, campeão do Major) na caixa de entrada.
- **Telas**: Calendário (agenda da temporada, filtros tier/região/qualificatórios, rota até o Major), Circuito (evento: formato, sede, participantes com convite/qualificatório, resultado com prêmio e VRS, premiação, edições anteriores), VRS com a composição dos pontos, Cena mundial com os resultados reais, escolha de campeonato com rota/LAN/visto/bootcamp, Major com o RMR.
- Medições: `npx tsx scripts/measure-circuito.mts 12`. Testes: `test-circuito-calendario`, `test-circuito-vrs`, `test-circuito-mundo`, `test-circuito-lan`, `test-career-vrs-mundo` (reescrito).

### Integração J × K × L (`fase4/integracao`)
- `MundoState` guarda os campos das três frentes (K: `seed`, `newgenAttrs`, `retirees`; L: `database`; J: `vrsAt`, `visa`, `qualifiers`, `bootcamp`). O `mundoOf` da Carreira é o da juventude (K); `withCircuit(base, circ)` (mundoCarreira) põe os campos do circuito por cima do bloco da juventude no fechamento do split e do Major; a semeadura do circuito escreve só calendário/resultados/VRS sobre o bloco VIVO (update funcional).
- O circuito, os convites, o VRS, o segundo plano e a semeadura rodam na base INTEGRADA (`worldBase` = oficial + admin + base customizada congelada + jovens → `currentEra`/`oppEra`). Time novo de base customizada entra no field da faixa de força dele e no VRS (teste `test-fase4-integracao`); `tagOfTeam`/`teamLite` leem `worldBase`, e o nome de quem não é da base oficial fica guardado no próprio resultado (`WorldEventResult.names`, `nameUnofficialTeams`/`storedTagOf`) — histórico legível mesmo se o time sair do mundo. O mercado da IA (K/I) lê o ranking novo (`clubVrsScore`).
- Progressão: régua nova mantida (decisão do Matheus).
- **Save enxuto (estouro de cota)**: `state/careerSaveCompact.ts` tira o `killFeed` das séries gravadas (liga, playoff, Major, histórico do Major, playoff da academia) — só a partida ao vivo lê; placar, `roundLog` e `stats` (Scoreboard com filtro de lado, MVP, Hall) ficam — e, com o Major encerrado, guarda o histórico só no `majorResult` (antes em três cópias). Roda no `persist` e ao abrir (hidratação), idempotente, sem subir SAVE_VERSION. Medido num fluxo real com Major jogado: 4,82 MB → 0,75 MB (outro: 4,36 → 0,75); Carreira longa sintética (liga + 3 stages + Champions + mundo de 12 splits) 5,72 → 1,21 MB, travada abaixo de 2 MB em `test-fase4-integracao`.
