# Realismo FM — Fase 3: pessoas e mercado (vestiário, contratos, IA de mercado)

No master: fase 1 (atributos reais, motor v2 por duelos calibrado, cena set/2026) e fase 2 (treino semanal, tática por mapa, comissão técnica — `engine/gestao`, save v28). Princípio: **a simulação decide, a interface mostra**, tudo visível como no FM, telas no padrão da interface universal (`components/ds/shell`, tokens em `styles/tokens.css`).

O que já existe e esta fase APROFUNDA E UNIFICA (não duplique — substitua/evolua): `engine/career/happiness.ts` (satisfação 5 fatores), `promises.ts` (diretoria), `playerPromises.ts` (a jogadores), `personality.ts` (5 tipos por hash), `engine/playerTalks.ts`, `decideOffer.ts` (clube vendedor), `transferAI.ts` (1 movimento/split), `buyout.ts` (cláusula derivada da IA), `unhappyMarket.ts`, `listedSales.ts`, `market.ts`, `teamEvents.ts`, e no save: `morale`, `satisfaction`, `coachBond`, `contracts` (só split final), `renewals`, `pendingOffer`, `pendingDeals`, `pendingSales`, `listedPrices`, `playerPromises`.

## Contrato (branch `fase3/base`)
- `src/engine/clube/model.ts`: `SquadStatus`, `Lineup`, `DressingRoomState`, `ContractTerms`, `Negotiation`, `ClubStrategy`, `IncomingOffer`, `TransferWindow`, `MarketState`, `ClubeState`.
- Esqueletos de cada frente: `clube/vestiario.ts` (`defaultDressingRoom`), `clube/contratos.ts` (`defaultContracts`), `clube/mercado.ts` (`defaultMarket`).
- Save da Carreira **v29** (`clube/clubeMigration.ts`): grava `save.clube`. Nenhuma frente sobe a versão; campo novo é opcional dentro do bloco da frente.
- Teste do contrato: `scripts/test-clube-contract.mts`.
- **Neutralidade**: sem nada configurado, a Carreira joga como hoje (mesmo cinco no motor, mesma economia). Quem mudar dinheiro/força precisa medir e manter a curva de dificuldade (`scripts/measure-neutralidade.mts` da fase 2 é a régua).

## Frentes
### G. Vestiário e banco (`fase3/vestiario`)
- **Status no elenco** (FM): estrela, importante, titular, rotação, reserva, promessa. Atribuído por você (e prometido em contrato pela frente H). Cada status tem expectativa de tempo de jogo; `playTime` mede mapas jogados/disponíveis; abaixo do esperado → insatisfação crescente, pedido de conversa, depois pedido de saída (vira oferta/rumor pela frente I).
- **Banco (6º/7º jogador)**: o elenco pode ter até 7; `lineup.starters` (5) joga, `bench` entra por lesão (integra `substituteInjured` da fase 2) ou decisão; trocar um titular entre mapas/séries é permitido fora de roster lock. Benching é a mecânica mais CS: jogador no banco perde ritmo (fase 2 `sharpness`), moral e valor, e pode pedir saída. Tela de escalação estilo FM (arrastar/selecionar).
- **Hierarquia e influência**: líderes do time por liderança (atributo), tempo de casa, CA, status; influentes arrastam a moral do grupo (positivo ou negativo).
- **Grupos sociais**: por idioma/país (line mista × nacional é muito CS), idade (veteranos × jovens); grupos coesos dão química (integra `pairChem`); jogador isolado sofre.
- **Personalidade ligada aos ocultos**: substitua o sorteio de 5 tipos por personalidade DERIVADA dos ocultos (profissionalismo, ambição, lealdade, temperamento) com rótulos estilo FM (Profissional modelo, Ambicioso, Leal, Temperamental, Mercenário, Líder nato…); mantenha compatibilidade com quem lê `playerPersonality`.
- **Felicidade unificada**: um modelo só de satisfação com fatores visíveis (tempo de jogo × status, resultados, papel tático (fase 2), salário × mercado (frente H), promessas, relação com técnico/comissão (`staffEffects().moraleRecovery`, manManagement), grupo social, ambição × tier do clube). Moral entra no motor (já entra? confira: se não, pequeno efeito calibrado) sem quebrar a neutralidade.
- **Conversas e reuniões**: conversas 1‑a‑1 com resultado dependente da personalidade e do tom; reunião de equipe (elogiar, cobrar, acalmar) com efeito na moral do grupo, mais forte com líderes a favor; conflitos entre jogadores (atrito por grupo/temperamento) que você resolve conversando ou vendendo.
- Tela: "Dinâmica" da sidebar da Carreira (hierarquia, grupos, felicidade detalhada por fator, conflitos) + escalação/banco no Elenco + status por jogador.

### H. Contratos e negociação (`fase3/contratos`)
- **Termos completos** (`ContractTerms`): salário por split, duração, luvas, cláusula de rescisão, status prometido, bônus de lealdade. Migre o `contracts` antigo e todo leitor dele para `clube.contracts`; o salário dos seus jogadores passa a vir do contrato (folha real) — calibre para que o save migrado tenha a mesma folha de hoje (`playerWage`).
- **Negociação em rodadas** com o jogador/agente (contratação, renovação): o outro lado tem exigências derivadas de CA, idade, status atual, ambição, lealdade, mercado, tier do seu clube e do que outros clubes pagam; cada rodada ruim gasta paciência; aceitar/contraproposta/recusar/abandonar; agente complica (quer luvas/cláusula baixa).
- **Renovações**: pedidas antes do fim; jogador ambicioso em time pequeno recusa ou pede cláusula baixa; leal aceita menos; contrato vencendo com status rebaixado → não renova.
- **Cláusula de rescisão**: proposta da IA ≥ cláusula = você não pode recusar (frente I usa); cláusula baixa facilita a assinatura.
- **Clube dono**: a negociação da transferência com o clube continua em `decideOffer` (evolua para rodadas com `Negotiation{party:'club'}`), e depois vem a do jogador.
- Tela: modal/tela de negociação estilo FM (termos, exigência, paciência, rodada), aba Contratos com a folha real e vencimentos.

### I. IA de mercado (`fase3/mercado`)
- **Orçamento por clube** da IA (tier, ranking VRS, premiação `bo3-earnings.json`, patrocínio) recalculado por split; **estratégia** (`ClubStrategy`) coerente com o clube (ex.: org BR tende a line nacional; tier 1 rico = starBuyer; academias = youth; sem caixa = survival).
- **Necessidades por função** (buraco de AWP/IGL, jogador velho, jogador em má fase) → alvos no mercado inteiro (inclusive os SEUS jogadores).
- **Propostas pelos seus jogadores** (`IncomingOffer`): valor, salário oferecido (mexe na vontade do jogador), via cláusula; aceitar/recusar/contrapropor; recusar jogador que quer sair → insatisfação (frente G).
- **Janelas**: janela aberta entre splits e no meio do split (curta); **roster lock** antes do Major; empréstimo e stand-in (jogador emprestado joga pelo outro time, volta no fim).
- **Mundo mais vivo** que o `transferAI` atual (1 movimento/split): vários movimentos plausíveis por janela, cadeias (clube que vende compra substituto), rumores e manchetes na caixa de entrada; o mundo tem que continuar equilibrado (medir OVR médio dos top 20 ao longo de 10 splits — sem inflação nem colapso).
- Tela: "Transferências" com propostas recebidas, rumores, janela/roster lock, orçamento dos rivais; lista de alvos com estratégia do clube dono.

## Regras comuns
- Só na sua worktree/branch (a partir de `fase3/base`), commit por marco, sem push/PR/merge. Não edite arquivos de outra frente sem necessidade; interfaces entre frentes: registre em "Mudanças de contrato" e no relatório.
- Calibração (`test-engine-calibration`) e neutralidade continuam verdes.
- Portões no fim: `npm run lint` (0), `npx tsc -b`, `npm test`, `npm run test:sim` (também `MATCH_ENGINE=v1`), `npm run build`. Um comando pesado por vez.
- Telas em 1440×900 e 390×844 (Playwright em `/private/tmp/claude-501/-Users-matheuscastro-orca-major-cs/3774674b-38bb-4228-8c79-6903e36bc699/scratchpad/video/cap/node_modules`, `chromium.launch({ channel: 'chrome' })`, porta própria) em `.../scratchpad/fase3-shots/<frente>-*`; confira você mesmo. Textos novos com en/es em `career-strings.ts`.

## Mudanças de contrato

### Frente G · vestiário (`fase3/vestiario`)
- `clube/model.ts` · `DressingRoomState` ganhou campos OPCIONAIS: `unrest?: Record<playerId, { level: 0|1|2|3; since }>` (1 incomodado · 2 pediu conversa · 3 pediu para sair) e `lastPlayTime?: Record<playerId, number>` (fração de mapas jogados no último split fechado). Cada conflito ganhou `mediatedAt?: number`.
- `clube/vestiario.ts` (para as frentes H e I):
  - `expectedPlayTime(status: SquadStatus): number` — fração de mapas que o status promete (estrela 0,95 · importante 0,85 · titular 0,7 · rotação 0,45 · reserva 0,2 · promessa 0,1).
  - `wantsToLeave(save, playerId): boolean` — pedido de saída (incômodo nível 3 por banco, ou satisfação < 25 com moral < 35). `leaveRequests(save, squadIds): string[]`.
  - `statusesOf(dressing, players)` — status efetivo (o atribuído, senão o automático por OVR); `STATUS_RANK`, `SQUAD_STATUSES`, `STATUS_LABEL`.
  - `benchValueFactor(dressing, playerId): number` — 0,85–1: quem vive no banco vale menos (a IA de mercado multiplica o valor).
  - `rosterLocked(save): boolean` — lê `clube.market.window?.rosterLocked` (a frente I grava `window?: TransferWindow` em `MarketState`); com lock, a escalação não muda.
  - `dressingOf(save)`, `resolveLineup(squadIds, lineup)` (os 5 que jogam + banco; sem escalação = os 5 primeiros), `SQUAD_MAX = 7`.
  - `promisesScore(list, split, statusPromise?, currentStatus?)` já lê `ContractTerms.statusPromise` (frente H): status prometido em contrato e não cumprido pesa na felicidade. `wageScore(contract.wage, marketWage)` entra na felicidade assim que a frente H gravar `clube.contracts[id].wage` > 0.
- `gestao/condicao.ts` · `substituteInjured(team, injured, standIns, bench = [])`: 4º parâmetro opcional; o banco entra antes da base, com id `user__` e custo de entrosamento `BENCH_TEAMWORK_COST = 0,3` (sem banco, idêntico).
- `chemistry.ts` · `tickPairChemAfterMatch(..., personalityBonus?, pairBonus?)`: 5º parâmetro opcional (grupo social).
- `career/happiness.ts`: modelo único; fatores novos opcionais (`playTime`, `role`, `wage`, `promises`, `staff`, `social`, `ambition`); só com os 5 antigos o número é o de antes. `moraleForm(m)` saiu do CareerScreen para cá.
- `career/personality.ts`: `derivePersonality(p)`, `fmPersonalityOf(h, leadership)`, `setPersonalitySource(fn)`, `personalityProfileOf(id)`, `FM_PERSONALITY_LABEL/DESC`; `playerPersonality(id)` continua com a mesma assinatura (sem fonte = hash).
- `career/playerPromises.ts`: tipo `'playtime'` e `PromiseJudgeCtx.playTimeMet?`.
- CareerScreen: `CareerSave.clube?: ClubeState` e `clubeOfSave(s)` (exportado).
- Elenco de até 7: `consummateDeals` recusa acordo que passaria de 7 (manchete "elenco cheio"); a janela (MarketScreen) aceita 5–7.

