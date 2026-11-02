# CONTEXT — vocabulário de domínio do MAJOR//CS

Glossário dos termos de domínio usados no código e nas revisões de arquitetura.
Use estes nomes exatamente — em código, comentários, testes e discussões.

## Road to Pro (RtP)

- **Sala** — o modo de jogar uma série beat-a-beat (decidir → executar → roll →
  placar). A regra da Sala é a **única verdade do placar** de uma série jogada e
  vive em `src/engine/rtp/room.ts` (máquina de estados pura); o componente
  `RtpRoundRoom` é só o adaptador de render. Fases lógicas: `decide` →
  `resolved` → `done`; ritmo de apresentação (needle, stinger, ponte) é
  sub-estado da UI.
- **Beat** — um momento pivotal da série (pistol, entry, economia, clutch, map
  point…). O plano de ~7 beats de uma série sai de `buildBeatPlan`
  (`roundModel.ts`), determinístico pelo `matchSeed`.
- **Momento** — a decisão dentro de um beat: situação + 3 opções
  (aggro/safe/smart), resolvida por `resolveMoment` com odds transparentes
  (`explainOdds`) — o % mostrado é o % rolado.
- **Spotlight / Execução** — beat com minigame: depois do lock-in você executa
  (mira, granada, call…) e a performance (`execPerf`) move as odds de verdade
  (`execBoostOf`). Rotação/dificuldade em `minigames.ts`.
- **Placar vivo manda** — o mapa fecha a partir do placar que a Sala mostrou
  (`closeMapFromLive`): vencer o último beat do mapa em 12-x fecha 13-x; perder
  com eles em 12 perde; salvar em 11-12 abre 12-12 e a prorrogação MR3 é jogada
  pela jogada (16-12…19-x). Quando o último beat não decide, os rounds que
  faltam são jogados round a round (`playOutMap`) com a chance por round da
  jogada (`roundPOf`, calibrada pra reproduzir `mapWinPOf` de 0-0). 2-0 varre,
  2-1 vai ao decider; o fechamento nunca encolhe o que a Sala mostrou.
- **Placar natural** — `resolveRoomSeries`: o fallback sem placar vivo (série
  pulada, mapas virtuais do MD5), mesma régua jogada de 0-0.
- **Ponte (bridge)** — os rounds que acontecem ENTRE beats
  (`bridgeToBeat`): o placar avança de forma plausível sob o teto
  `capBeforeBeat` (13 − beats restantes no mapa), então só o último beat do
  mapa pode decidi-lo; a ponte do último beat para no match point (12-x).
- **Roteiro por formato** — `buildBeatPlan` gera rounds estritamente
  crescentes por mapa (MD1 com os 7 beats no mesmo mapa), fim do half no round
  12 e lado derivado do half (`sideAtRound`, com a regra de OT do CS2).
- **Momentum** — 0..1, aquece/esfria a próxima decisão (±8% no atributo
  efetivo); semeado pela confiança pré-jogo.
- **Postura / contra-jogo** — em cada beat o adversário joga de um jeito
  (`postureAt`: vêm pra cima, jogam passivo ou armaram o setup), sorteado pelo
  seed com o viés do elenco (`postureLeanOf`, a mesma tendência do scouting).
  Pedra-papel-tesoura (`counterDeltaOf`, ±12pp): seguro vence o rush, agressivo
  vence o passivo, inteligente vence o setup. Sem leitura as odds usam o
  confronto esperado pela tendência; com leitura, o exato — o % mostrado segue
  sendo o % rolado. Nenhum estilo fixo domina (`scripts/rtp-style-mc.mts`,
  testado em `test-rtp-invariants.mts`); ler e contra-atacar é o que rende.
- **Leitura tática** — recurso limitado (escala com game sense) que revela a
  postura do adversário no beat e soma +2 no atributo da decisão atual.
- **Virada de semana** — a virada canônica é `turnWeek` (`weekly.ts`):
  patrocínio, investimentos, evento de vida e dinastia; `weeklyTick` é o tick
  de medidores/salário/custos que a antecede. O circuito
  (`concludeCircuitRound`) invoca ambos em todos os caminhos — não existem
  duas definições de semana.
- **Vida de pro** — os gastos de longo prazo da carreira (moradia, casa da
  família, investimentos) — `lifestyle.ts`.

## Convenções

- Engine puro em `src/engine/` (sem `Math.random`/`Date.now`; RNG semeado via
  `makeRng`), comentários em PT-BR; UI em `src/components/`.
- Testes de engine em `scripts/test-*.mts` (`npm run test:sim`).
