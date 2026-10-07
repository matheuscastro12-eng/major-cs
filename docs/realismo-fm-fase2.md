# Realismo FM — Fase 2: gestão do time (treino, tática por mapa, comissão técnica)

Fase 1 (no master): 28 atributos como fonte da verdade (`engine/attrs/model.ts`, `attrsOf`), evolução por atributo (`engine/attrs/progression.ts`), motor v2 por duelos (`engine/match2/`, calibrado contra CS2 real — `docs/calibration-targets.json`, teste `test-engine-calibration`), cena de setembro/2026 do bo3.gg.

Princípio: **a simulação decide, a interface mostra** — e tudo visível como no FM (decisão do Matheus). Cada sistema novo tem que pesar de verdade (no motor ou na evolução) e ter tela no padrão da interface universal (`src/components/ds/shell/`, tokens em `src/styles/tokens.css`).

## Contrato (branch `fase2/base`)
- `src/engine/gestao/model.ts` — tipos: `TrainingState`, `PlayerCondition`, `TacticsState`/`MapTactic`/`TeamInstructions`/`TacticDuelMods`, `StaffMember`/`StaffState`/`StaffEffects`, `GestaoState`.
- Arquivos de cada frente (já existem como esqueleto): `gestao/treino.ts` (`defaultTrainingState`, `defaultCondition`), `gestao/tatica.ts` (`defaultTactics`, `NEUTRAL_TACTIC_MODS`), `gestao/staff.ts` (`defaultStaff`, `staffEffects` — linha de base 1.0).
- Save da Carreira **v28** (`gestao/gestaoMigration.ts`, cadeia em `state/saveMigrations.ts`): grava `save.gestao` com os padrões. **Nenhuma frente sobe a versão do save**; se precisar de campo novo, ele é opcional dentro do bloco da frente e o `default*` dela o preenche.
- Teste do contrato: `scripts/test-gestao-contract.mts`. Linha de base neutra: sem tática/staff configurados o jogo joga EXATAMENTE como hoje (calibração intacta).

## Frentes
### D. Treino semanal (`fase2/treino`)
- Agenda da semana (7 slots de `TrainingSession`) e intensidade; foco individual por atributo ou por função (substitui o foco de 5 atributos de `engine/career/training.ts`, migrando o foco antigo); mapas priorizados.
- Efeitos: ganho por atributo alimentando `engine/attrs/progression.ts` (com teto no PA, idade, profissionalismo, `staffEffects().training`), familiaridade tática dos mapas priorizados (via função pública da frente de tática — combine assinatura no doc), condição (`fitness`, `sharpness`) e risco de lesão/burnout por intensidade (`staffEffects().injuryRisk/injuryRecovery`), scrim com chance de vazar estratégia para o adversário (reduz a vantagem de anti-strat contra você).
- Motor: `fitness` e `sharpness` do jogador entram no duelo (pequeno, calibrado) e lesionado não joga (reserva/jovem entra). Onde a condição vive por partida: `TPlayer` recebe campo opcional (registre no contrato).
- Tela: "Treinos e scrims" da sidebar da Carreira — agenda semanal estilo FM, foco por jogador, intensidade, barra de condição por jogador no Elenco, aviso de lesão na caixa de entrada.
- Integra com o sistema atual de scrims (`engine/scrim.ts`) e fadiga (`engine/career/fatigue.ts`) — substitua o que for duplicado.

### E. Tática por mapa (`fase2/tatica`)
- Para cada mapa do pool: papéis por jogador (`MapRole`), setup de CT, repertório de execuções do T, instruções por mapa (sobrescrevendo as gerais), familiaridade 0–100 (cresce com treino de tática/scrim/partida no mapa; decai sem uso).
- Instruções de equipe gerais (ritmo, utilitária, política de eco/force, agressividade, timeouts).
- Anti-strat: preparar contra o próximo adversário (usa `staffEffects().antiStratRead` e o relatório do analista existente `engine/analystReport.ts`); o adversário também tem tendências (IA gera `TacticsState` coerente com estilo do técnico/IGL e identidade).
- Motor v2: `tacticDuelMods(...) → TacticDuelMods` aplicado no `engine/match2` — papel certo/errado muda o engajamento e o duelo (jogar fora do papel custa atributo equivalente, versatility oculto atenua); setup de CT × execução do T (pedra-papel-tesoura suave, familiaridade escala o efeito); política de eco/força muda a compra; tempo e agressividade mexem nas fases do round. Os `GamePlan`/`Playbook`/identidade tática/calls atuais continuam funcionando (a tática por mapa é a camada de preparação; o plano e as calls são o ajuste ao vivo) — sem contagem dupla.
- Calibração: com a IA dos dois lados usando táticas padrão, TODOS os alvos de `docs/calibration-targets.json` continuam na tolerância; tática boa × ruim precisa mover a vitória de forma plausível (medir e registrar, ex.: familiaridade 90 × 20 no mesmo time).
- Tela: "Plano de jogo" da sidebar da Carreira — seletor de mapa, quadro com os 5 jogadores e seus papéis, setup CT, execuções T, instruções, familiaridade; relatório do adversário com tendências e sugestão de anti-strat.

### F. Comissão técnica (`fase2/staff`)
- Cargos (`StaffRole`) com atributos 1–20 (`StaffAttrKey`), idade, salário, contrato. Técnico atual do time vira `headCoach` com atributos derivados do rating/estilo (`Coach` em `types.ts`) na migração (preencha `defaultStaff` a partir do save).
- Mercado de staff: pool gerado determinístico (nomes plausíveis, países pela região; ex-jogadores aposentados da base viram candidatos — `__retired__` em `bo3-2026.json`), contratar, demitir (multa), renovar; teto de folha pela diretoria/finanças existentes.
- `staffEffects(staff)` real: cada efeito calculado dos atributos certos (ex.: `training.aim` ← aimCoaching dos treinadores; `familiarityGain` ← tactics/mapKnowledge; `antiStratRead` ← analysis; `scoutAccuracy` ← judgingAbility/Potential dos olheiros — estreita a faixa de CA/PA do perfil (`engine/attrs/stars.ts`); `moraleRecovery` ← motivating/manManagement/mentalCoaching; `injuryRisk/Recovery` ← fitness; `youthGrowth` ← youthDevelopment). Linha de base 1.0 = comissão mediana; comissão ruim < 1.
- IA: clubes da IA têm comissão coerente com orçamento/tier (afeta a força deles de forma pequena e calibrada).
- Tela: "Comissão técnica" da sidebar — tabela estilo FM com atributos 1–20 coloridos, perfil do membro, mercado de staff, contratar/demitir.

## Regras comuns
- Trabalhe só na sua worktree/branch (a partir de `fase2/base`), commit por marco, sem push/PR/merge.
- Não edite arquivos de outra frente sem necessidade; interfaces entre frentes: registre em "Mudanças de contrato" abaixo e no relatório.
- Calibração é portão: `scripts/test-engine-calibration.mts` tem que continuar verde com a linha de base e com táticas/comissão padrão da IA.
- Portões no fim: `npm run lint` (0), `npx tsc -b`, `npm test`, `npm run test:sim` (também com `MATCH_ENGINE=v1`), `npm run build`. Um comando pesado por vez.
- Telas: capture 1440×900 e 390×844 (Playwright em `/private/tmp/claude-501/-Users-matheuscastro-orca-major-cs/3774674b-38bb-4228-8c79-6903e36bc699/scratchpad/video/cap/node_modules`, `chromium.launch({ channel: 'chrome' })`; dev server em porta livre própria) e confira você mesmo.

## Mudanças de contrato
### Frente F (comissão técnica, `fase2/staff`)
- **[F · staff] `defaultStaff(save?, coach?)`** (era `defaultStaff()`): recebe o save e, opcionalmente, o `Coach` já resolvido. `migrateGestao` passa o save. Sem técnico no save → comissão vazia (neutra). Técnico iniciante/personalizado se resolvem aqui; técnico de time real é resolvido pelo CareerScreen (a base bo3 não pode entrar na migração, que vai no bundle inicial) via `syncHeadCoach(staff, coach, coachFromId, split)`.
- **[F · staff] `StaffMember` ganhou campos opcionais**: `since?` (split de entrada, idade exibida), `style?` (CoachStyle do técnico principal), `sourcePlayerId?` (ex-jogador aposentado). Save continua v28.
- **[F · staff] `staffEffects(staff)`**: assinatura igual. `null`/lista vazia = neutro (todos 1, frações 0). Atributo 10 em tudo = 1.0 exato (frações `antiStratRead`/`scoutAccuracy` ≈ 0,43); cargo vago conta como atributo 7. Consumidores: treino (`training`, `injuryRisk/Recovery`), tática (`familiarityGain`, `antiStratRead`). A frente F já liga `moraleRecovery` (reversão da moral em `nextMorale`), `youthGrowth` (evolução da academia, `scaleStep`) e `scoutAccuracy` (5º parâmetro opcional de `paRange` em `engine/attrs/stars.ts`, 0 = largura antiga).
- **[F · staff] Técnico principal ⇄ técnico do save**: contratar um técnico principal no mercado de staff grava `coachFromId: '__custom__'` + `customCoach` (`coachFromStaff`) e abre stint novo — o motor e o resto da Carreira leem o técnico como antes.
- **[F · staff] Economia**: a folha da comissão (`staffPayroll`) é debitada na virada de split (as duas viradas do CareerScreen) via `staffSplitTick`, que também resolve contratos (técnico principal renova sozinho). Teto da folha da comissão: `staffWageCap({ tier, board, sponsorIncome })`.
- **[F · staff] IA**: `engine/gestao/staffData.ts` (só Carreira) gera a comissão de cada clube pelo tier (ranking de força da base) e soma `aiStaffEdgeFor(ts)` no `strength` dos times da IA em `startSplit` e `playMajor`. Delta relativo à comissão típica do tier: medido −0,28…+0,26 (média |·| < 0,05 por tier), teto ±0,5. Os times do harness de calibração não passam por aí.

### Frente E (tática, `fase2/tatica`)
- `TacticDuelMods` (model.ts) ganhou campos OPCIONAIS: `mapRole` (papel no mapa por jogador → tabela de engajamento), `phaseLogit` ({open, mid, post}), `plantMult`, `timeMult`, `tradeMult`, `saveMult`. `engageWeight` passou a ser o multiplicador da abertura (instrução de agressividade × estilo).
- `TTeam.tactics?: TacticsState | null` (types.ts): é por aqui que a tática chega ao motor v2 (opt-in; o v1 ignora). A Carreira anexa em `prepareTeams` (usuário: `save.gestao.tactics`; IA: `aiTactics(team, { id: adversário, scouting })`).
- `RoundSpec.phaseBias?: [abertura, meio, pós-plant]` e `RoundSpec.timeMult?` (match2/round.ts). Ausentes = motor bit a bit de antes.
- `MapSimOpts.manualTimeouts?: 0 | 1`: o time que chama timeout à mão (MatchScreen passa o `userIdx`) não recebe timeout automático. `MapSimV2.autoTimeouts()` lista os automáticos.
- Funções públicas de `gestao/tatica.ts` para as outras frentes:
  - **treino**: `gainFamiliarity(tactics, map, points): TacticsState` (retorno decrescente perto de 100; negativo tira; cria o plano padrão do mapa se não houver) e `gainAntiStrat(tactics, opponentTeamId, points)` (sessão de VOD). O decaimento sem uso e o ganho por partida (+3 por mapa jogado, −1,5 por série nos outros, piso 20) já rodam no fim de cada série (`tacticsAfterMatch` em `recordCareerMatch`) — o treino NÃO precisa decair de novo. Se o treino quiser um decaimento semanal próprio, use `decayFamiliarity(tactics, mapasTreinados, amount)`.
  - **staff**: `staffEffects().antiStratRead` entra em `antiStratReveal(read, nívelAnalista)` (quanto do plano adversário aparece na tela e a prontidão inicial ao preparar) e `staffEffects().familiarityGain` multiplica o ganho de familiaridade por partida.
- `save.gestao` pode não existir em carreira nova criada já na v28 (a migração só roda em save antigo): a Carreira usa `save.gestao ?? migrateGestao({ squad }).gestao` e grava o bloco na primeira mudança.
- `mapTraining` (treino de mapa antigo → `mapPrefs`) continua como está: é o conforto de DUELO no mapa. Familiaridade é o domínio do PLANO. Se a frente de treino trocar o "Treino de mapa" por familiaridade, remova o `mapTraining` para não contar duas vezes.

### Efeitos medidos (frente E)
`npx tsx scripts/measure-tactics.mts 4000` — espelho: o MESMO elenco (40 times tier S) contra um clone de si; só a tática muda; 4000 mapas por linha (±0,8 pp).

| Confronto (A × B) | Vitória de mapa do A | Round do A |
|---|---|---|
| sanidade: sem tática × sem tática | 49,4% | 49,8% |
| sanidade: tática da IA × tática da IA | 50,9% | 50,1% |
| familiaridade 90 × 20 | **62,0%** | 53,2% |
| familiaridade 80 × 50 | 56,0% | 51,4% |
| familiaridade 50 × 20 | 55,9% | 51,4% |
| papéis naturais × embaralhados | **66,8%** | 54,4% |
| papéis naturais × AWP↔IGL trocados | 62,0% | 53,2% |
| contra ideal (stackA/rush B) × previsível (stackA/rush A) | 63,4% | 53,6% |
| repertório variado × previsível (sem leitura) | 52,1% | 50,4% |
| anti-strat 100 × 0 (IA variada) | 54,7% | 51,0% |
| anti-strat 50 × 0 | 52,7% | 50,5% |
| anti-strat 100 × previsível | 58,7% | 52,2% |
| **tática boa × ruim** (fam 85, papéis certos, variado × fam 25, embaralhado, previsível) | **75,7%** | 57,4% |
| eco: sempre forçar × padrão | 49,9% | 49,9% |
| eco: save total × padrão | 51,0% | 50,3% |
| ritmo rápido × equilibrado | 51,0% | 50,2% |
| ritmo lento × equilibrado | 50,4% | 49,9% |
| agressiva × equilibrada | 50,6% | 49,9% |
| passiva × equilibrada | 50,7% | 50,1% |
| utilitária pesada × equilibrada | 49,3% | 49,7% |
| timeout cedo × tarde | 51,2% | 50,1% |
| plano padrão de quem nunca mexeu × tática da IA | 50,2% | 49,9% |

Leitura: familiaridade, papéis e o confronto setup × execução movem a vitória de forma grande e plausível; as instruções são trocas (perto de neutras na média, dependem do encaixe com o elenco e o adversário); o plano padrão do usuário empata com a tática da IA (a dificuldade da Carreira não muda por causa da IA ter tática).

### Calibração (frente E)
`npx tsx scripts/calibrate-engine.mts 2500 20260929 --tactics` (os dois lados com `aiTactics` e anti-strat pelo scouting): TODOS os alvos dentro da tolerância, travado em `scripts/test-tactics.mts`. Sem tática, o motor é bit a bit o de antes (mesmos 54.158 rounds na seed do teste). Deslocamento médio com tática: CT% 52,0 → 51,3 (8000 mapas; o timeout automático quebra mais sequências do CT), clutch 1v1 igual à linha de base (49,5–49,8% em amostras grandes; o alvo 55,6 ± 7 já estava perto da borda antes da fase 2).

### Frente D (treino)
- `TrainingState` ganhou campos OPCIONAIS (o `defaultTrainingState` preenche): `progress` (pontos de treino por jogador/atributo no split), `weeks`, `weekNo`, `leaks` (teamId → vazamento 0–1) e `lastWeek: TrainingWeekReport`. Tipos novos em `model.ts`: `InjuryKind`, `TrainingWeekReport`.
- `defaultCondition(legacyFatigue?)`: parâmetro opcional (fadiga antiga → fitness).
- `TPlayer.cond?: { fitness; sharpness }` (types.ts): a condição da partida. Ausente = neutro (IA, calibração intacta). Lida pelo v2 (`fixedMod`) e pelo v1 (forma equivalente) via `engine/gestao/condicao.ts`.
- `EvolveContext.trainMul?: Partial<Record<AttrKey, number>>` (attrs/progression.ts): multiplicador por atributo vindo do treino do split (agenda padrão = 1).
- Familiaridade: o treino chama `gainFamiliarity(tactics: TacticsState, map: MapId, points: number): TacticsState` — **a frente E exporta de `gestao/tatica.ts`**. Até lá, `gainFamiliarityLocal` em `treino.ts` (stub com a mesma assinatura: cria o `MapTactic` padrão se faltar e soma, teto 100). Integração: trocar a constante `gainFamiliarity` em `treino.ts` pelo import.
- Vazamento de scrim: `leakAgainst(training, oppId)` (0–1) e `scrimLeakReadiness(readiness, leak)` (`condicao.ts`) — a frente E aplica no `antiStrat.readiness`. Hoje o vazamento já pesa: −1,5 de força × vazamento contra ESSE adversário (`applyScrimLeak`).
- `gestaoMigration.ts`: `training: trainingFromLegacy(save)` (foco antigo de 5 atributos → foco por atributo; `mapFocus` antigo → mapas priorizados) e `defaultCondition(fadiga antiga)`.
- `CareerSave.gestao?: GestaoState` e `updateGestao` na Carreira; `gestaoOf(save)` (treino.ts) lê o bloco com padrões (carreira nova sem bloco).
- Fadiga: `save.fatigue` deixou de ser gravado; a fonte é `gestao.condition[id].fitness` (fadiga = 100 − fitness, `fatigueView`). `applyFatigueForm`/`recoverFatigue` saíram (viraram `applyConditionToTeam`/`recoverCondition`).
- `ScrimMatchReport.map` (scrim.ts); a scrim marcada não reduz mais fadiga (ritmo +6, condição −4, familiaridade no mapa, vazamento).

## Integração (`fase2/integracao`)
Merges na ordem staff → tática → treino. Encaixes entre as frentes:
- **Treino → tática**: o treino chama `gainFamiliarity` de `tatica.ts` (o stub `gainFamiliarityLocal` saiu; mapa sem plano parte de 50, não de 0). O treino NÃO decai familiaridade: o decaimento roda uma vez só, no fim da série (`tacticsAfterMatch`), ANTES da semana de treino.
- **VOD → anti-strat**: `vodPrepPoints(training)` (8 por sessão de VOD × ganho da intensidade) entra ao preparar (`prepareAntiStrat(…, vodPoints)`) e, na semana, soma no alvo já escolhido (`gainAntiStrat`).
- **Vazamento de scrim**: `leakAgainst(training, oppId)` vira prontidão de anti-strat da IA que te viu (`aiTactics(team, { …, leak })`, até +50 com vazamento total), no lugar do −1,5 de força (`applyScrimLeak` não é mais chamado na partida).
- **Analista automático**: sem preparação manual, o seu time estuda o adversário com a MESMA regra da IA (`autoAntiStratReadiness(scoutingOf(time))`); preparar no Plano de jogo vence o automático. O plano "Anti-strat" só perde o +2 genérico com preparação manual.
- **mapTraining**: priorizar mapa virou familiaridade; o domínio antigo (`mapTraining` → `mapPrefs`) não cresce mais e se desfaz 0,3 por split. O painel "Mapas" do Elenco mostra a familiaridade.
- **staffEffects**: `training[sessão]`, `injuryRisk`, `injuryRecovery` → treino; `familiarityGain` → cada fonte de familiaridade uma vez (semana de treino, scrim marcada, partida); `antiStratRead` → `antiStratReveal` (prontidão inicial e o que aparece do adversário); `moraleRecovery`, `youthGrowth`, `scoutAccuracy` → staff.
- **Recuperação protegida (treino)**: abaixo de 40 de fitness a semana recupera +0,5 por ponto abaixo do piso. A faixa 40–100 segue igual à fadiga antiga; o calendário real (~4 séries por etapa) não queima mais o elenco de quem usa a agenda padrão (lesionados: 9% → 4% das vagas).
- **Motor**: 1v1 com memória (`DUEL.ADV_1V1 = 0,4`): quem tinha mais vivos antes de o round virar 1v1 leva o viés no duelo final, na DP e na amostragem.

### Neutralidade (quem nunca mexe) — `npx tsx scripts/measure-neutralidade.mts 150`
Temporada modelo 3 splits × 3 etapas × 4 séries MD3, folgas de 16/40; antes = base 51ed95f (fadiga antiga, sem tática); depois = agenda padrão normal + tática padrão + IA com tática.

| | Vitória em série | Δ |
|---|---|---|
| antes da fase 2 | 29,3% | — |
| depois, sem os ajustes da integração | 24,1% | −4,5 pp (burnout: −3,8; IA te lendo: −2,1) |
| **depois, integrado** | **29,2%** | **−0,1 ± 0,8 pp** |

Travado em `scripts/test-fase2-integracao.mts` (±2 pp).

### Calibração final (2500 mapas, seed do teste)
Todos os alvos na tolerância com e sem a tática da IA. Clutch 1v1: 49,6% → **55,4%** (linha de base) / 54,1% (tática), alvo 55,6 ± 7; clutch 1v2 14,4% (16,8 ± 6); curva força→vitória v1/v2: +0 49,3/49,7 · +4 71,8/67,2 · +8 85,0/84,8 · +14 95,2/98,3.

## Estilo de jogo (`fx/estilo`)
Pedido dos jogadores: "o time joga padrão, agressivo, passivo…". Camada por cima do plano por mapa, por LADO, com efeito no motor v2 por duelos (`engine/gestao/estilo.ts`).
- Estilos: T = Padrão, Agressivo, Passivo (lurk), Controle (lento), Rush; CT = Padrão, Agressivo, Passivo, Controle, Stack/retake. **Padrão = nenhum modificador (motor bit a bit de antes)**.
- Mecanismo: engajamento por fase (quem duela na abertura/meio/pós-plant, por papel e estilo do jogador), viés por fase que depende do PERFIL do elenco (`styleProfile`: entry, hold, leitura, pós-plant, retake, clutch, troca, utilitária em desvios da base, centrados — só a forma; IGL absoluto), trocas, plant, tempo, cessão do site (`oppPlantMult`) e peso da mira (`RoundSpec.kMult`: < 1 = mais variância, bom pro azarão). Confronto de estilos leve (`STYLE_RPS`, Padrão neutro).
- Familiaridade por estilo (`TacticsState.styleFam`, 0–100, padrão 35): +4 por mapa jogado com o estilo, −1 por série parado (piso 25), em `tacticsAfterSeries`. Qualidade = familiaridade do estilo × familiaridade do mapa (fase 2).
- Contrato (tudo opcional, save continua v28): `TacticsState.style?`/`styleFam?`; `TacticDuelMods.engageMid?`/`engagePost?`/`kMult?`/`oppPlantMult?`; `RoundSpec.kMult?`; `TeamPlan.style`/`styleQ`/`profile`/`players`; `MapResult.styleStats?`/`styles?` (só com tática); `MapSim.style?()`/`setStyle?()` (só v2; troca ao vivo, a % mostrada já vê).
- IA: `aiStyle` (dentro de `aiTactics`) adota um estilo quando o encaixe estimado passa da margem, com viés do técnico/playbook; na base, ~1/3 dos times usa estilo no T e ~1/6 no CT.
- Tela: painel "Estilo de jogo" no Plano de jogo (encaixe 0–100 + pp por round, familiaridade, o que valoriza, variância, contra o estilo do adversário); seletor ao vivo na partida; "Estilo em campo" no pós-jogo (aberturas, trocas, plant, pós-plant, retakes, tempo, clutches).

### Efeitos medidos — `npx tsx scripts/measure-estilo.mts 4000`
Espelho (mesmo elenco, perfil modificado ±0,35 × perfil, familiaridade de estilo 70) contra Padrão; ±0,8 pp por célula. Mapa do lado com estilo:

| Perfil | melhor (T + CT) | pior (T + CT) | ideal × pior numa MD3 |
|---|---|---|---|
| médio (tier S real) | Rush + Controle 51,1% | Passivo + Passivo 49,3% | 2,7 pp (ruído) |
| mira de entrada | Agressivo + Agressivo 53,4% | Passivo + Passivo 48,8% | 7,0 pp |
| cabeça (leitura/IGL) | Passivo + Controle 51,2% | Agressivo + Agressivo 47,6% | 5,5 pp |
| frieza (pós-plant/clutch) | Passivo + Controle 50,7% | Controle + Agressivo 47,1% | 5,4 pp |
| coletivo (troca/utilitária) | Rush + Padrão 52,7% | Passivo + Passivo 44,9% | 11,6 pp |

Travado em `scripts/test-estilo.mts` (neutralidade bit a bit, o melhor estilo muda com o perfil, faixa da MD3, encaixe da tela × motor, familiaridade, confronto, variância, troca ao vivo, IA). Calibração (`test-engine-calibration`, sem tática) e `test-tactics` (IA com tática e estilo) verdes; neutralidade da integração (`test-fase2-integracao`) verde.

### Plano antigo (GamePlan) × estilo — como unificar
O "plano de jogo" da partida (`CareerScreen` › `applyGamePlanBuff`: Disciplinado +1,5, Agressivo +2,5, Anti-strat +2, Foco no mapa +1 de força) é bônus plano de força e NÃO foi mexido aqui (outra frente mexe em força/dificuldade). Proposta: "Agressivo" vira atalho do estilo Agressivo/Agressivo (sem bônus de força), "Disciplinado" vira Controle/Controle, "Anti-strat" mantém só o foco da preparação (`matchTacticsFor`) e "Foco no mapa forte" fica como está (veto + mapPrefs). Assim o seletor da tela inicial escreve `tactics.style` e o bônus plano some.
