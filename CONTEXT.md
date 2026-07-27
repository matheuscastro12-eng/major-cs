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
- **Placar natural** — o placar que a jogada produz mapa a mapa
  (`resolveMapFromPlay` + `mergeMapClose`): 2-0 varre, 2-1 vai ao decider; o
  fechamento nunca encolhe o que a Sala mostrou. `resolveRoomSeries` é o
  fallback sem placar vivo (série pulada).
- **Ponte (bridge)** — os rounds que acontecem ENTRE beats
  (`bridgeToBeat`): o placar avança de forma plausível, sem contradizer o teto
  de 12/13.
- **Momentum** — 0..1, aquece/esfria a próxima decisão (±8% no atributo
  efetivo); semeado pela confiança pré-jogo.
- **Leitura tática** — recurso limitado (escala com game sense) que revela a
  tendência do adversário e soma +2 no atributo da decisão atual.
- **Virada de semana** — o tick semanal (medidores, salário, custos, moradia,
  investimentos) — `weeklyTick` em `weekly.ts`; a orquestração completa da
  semana no circuito passa por `withWeekStart`/`concludeCircuitRound`
  (`circuit.ts`).
- **Vida de pro** — os gastos de longo prazo da carreira (moradia, casa da
  família, investimentos) — `lifestyle.ts`.

## Convenções

- Engine puro em `src/engine/` (sem `Math.random`/`Date.now`; RNG semeado via
  `makeRng`), comentários em PT-BR; UI em `src/components/`.
- Testes de engine em `scripts/test-*.mts` (`npm run test:sim`).
