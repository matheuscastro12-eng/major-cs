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
