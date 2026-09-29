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
- **Field**: o MESMO de antes (faixas de força; dificuldade intacta); o VRS decide quem é convidado. Sua rota: seu tier, um abaixo, um acima por convite (VRS ≤ 20 pro T1, ≤ 44 pro T2) ou qualificatório (fechado: VRS ≤ 48, 1 MD3; aberto: MD1 + MD3). Um qualificatório por etapa; cada série conta como semana de treino.
- **VRS** (`engine/mundo/vrs.ts`): premiação real (45%), rede de adversários batidos (35%), LAN (20%), 10 melhores resultados, normalização pelo líder (raiz em premiação e rede), peso cheio até 1 etapa e zero em 6. Distribuição por posição calibrada na régua antiga (patrocínios/prestígio intactos): #1 2162→~2000, #8 972→~1300, #16 701→~950, #32 538→~470, #64 208→~200.
- **Major pelo VRS**: 1–8 Stage 3, 9–16 Stage 2, 17–24 Stage 1, RMR regional pros próximos 16 de cada região. Cair no RMR = sem Major (objetivo "Major" falha, prêmio do RMR). O resto do Major (outros RMRs, stages antes da sua entrada, o que falta se você cair) roda em segundo plano e vira resultado do mundo.
- **LAN**: pressão pequena no oculto bigMatch (bigMatch 18 × 5: +6,8 pp de vitória de mapa em LAN, +16,8 pp na final; time médio: LAN − online = +0,3 pp). **Visto**: risco por região (CIS→Américas 7%, Ásia→Europa 3,5%, Europa→Américas 0,8%…), no máximo um por evento → stand-in pela cadeia de lesão. **Bootcamp**: antes de LAN, 35–60 mil (+40 mil fora do continente), +química dos titulares, +familiaridade nos 3 mapas do plano, +moral, condição.
- **Mundo em segundo plano** (`engine/mundo/mundoSim.ts`): modelo de força calibrado contra o motor (logística 0,15/ponto por mapa; MD3 Δ0 50/53%, Δ+4 79/76%, Δ+8 91/89% modelo/motor). ~0,6 ms por etapa inteira + publicação do VRS; Major completo ~1 ms. Manchetes (campeões T1, zebra, resumo T2, campeão do Major) na caixa de entrada.
- **Telas**: Calendário (agenda da temporada, filtros tier/região/qualificatórios, rota até o Major), Circuito (evento: formato, sede, participantes com convite/qualificatório, resultado com prêmio e VRS, premiação, edições anteriores), VRS com a composição dos pontos, Cena mundial com os resultados reais, escolha de campeonato com rota/LAN/visto/bootcamp, Major com o RMR.
- Medições: `npx tsx scripts/measure-circuito.mts 12`. Testes: `test-circuito-calendario`, `test-circuito-vrs`, `test-circuito-mundo`, `test-circuito-lan`, `test-career-vrs-mundo` (reescrito).
