# BUT → MAJOR//CS "Ultimate Squad" — mapa completo + proposta single-player

> Documento de mapeamento do subsistema **BUT (Brasval Ultimate Team)** e proposta de um equivalente **single-player / offline-first** para o MAJOR//CS.
> BUT vive em `/tmp/brasval/src/but` (67 arquivos, ~24.7k LOC) + backend `/tmp/brasval/server` + `engine-core/src/but`.
> MAJOR//CS: React + TS + Vite + Zustand, save em localStorage (+ cloud sync opcional), dataset real de CS2 2026. **Sem backend novo.**

---

## 1. O que é o BUT

O **Brasval Ultimate Team** é um clone de FUT (FIFA Ultimate Team) enxertado num manager de CS/Valorant. O jogador abre **pacotes** que dropam **cartas de jogadores** (por raridade, com odds), monta um **squad de 5** numa formação com **química** entre as cartas, e joga **partidas ranqueadas** (PvP e vs NPC) para subir de **ELO → divisão de rank**, ganhar **moeda**, e colecionar/negociar cartas num **mercado** e em **trocas P2P**. Arquitetura é **thin-client / fat-server**: TUDO que importa (inventário, moeda, ELO, RNG de pacote, partidas, trades, compras) é **autoritativo no servidor** (MySQL, 28 migrations); o cliente React é só uma casca tipada sobre REST + WebSocket. A matemática pura (OVR, química, raridade, quicksell, rank-por-ELO) fica em `engine-core/but/` para cliente e servidor produzirem números idênticos.

**Loop do jogador (ponta a ponta):**

1. **Entra** em `/online` (exige login) → gate de **onboarding** na 1ª vez: escolhe 1 de 5 formações → ganha 5 cartas iniciais (reveal animado).
2. **Hub**: vê rank/ELO, economia, forma recente, squad ativo, daily reward.
3. **Abre pacotes** (Store): compra com coins (jogados) ou gems (dinheiro real) → **roleta CS:GO-style** revela as cartas → cartas entram no inventário.
4. **Monta squad** (Squad Builder): encaixa cartas nos slots da formação → química + OVR atualizam ao vivo → salva (auto-ativa).
5. **Fila/joga**: ranqueada PvP (matchmaking por ELO) OU casual vs NPC (ban → agent-pick → play → end).
6. **Recompensas**: tela de fim mostra ELO delta + coins voando; títulos podem ser concedidos.
7. **Coleciona/negocia**: Club (quick-sell de duplicatas), Marketplace (leilão), Trade (salas P2P), Trade-Ups (funde 3→1), Titles. Leaderboard + perfis públicos fecham o loop social; a season enquadra tudo com data de fim + prêmios.

---

## 2. Mapa completo do BUT

### 2.1 Cartas / Inventário / Química

**Como funciona.** Uma "carta" tem dois níveis: **catálogo mestre** (`but_cards`, compartilhado, admin, read-only) vs **cópia possuída** (`but_inventory`, por usuário). Mesmo jogador real pode ter várias cartas, uniqueadas por `(player_real_id, season_tag, rarity)` (ex.: "Less Base 2026", "Less TOTS 2026"). As 6 stats faciais (kill/aim/mov/sense/clutch/util, 1-99) são **derivadas** dos 27 atributos do engine (escala 1-20), não armazenadas. OVR = média ponderada das 6. Não há booleano "foil" — "special" é 100% codificado pela `rarity`; o brilho/shimmer é dirigido por um `SHIMMER_RARITIES` set no `BUTCard.tsx`. **Não há level/XP** — a progressão é 100% ELO → divisões de rank.

**Química** (`chemistry.ts` + `formations.ts`): squad = 5 slots num pentagrama. Por aresta (link entre 2 slots preenchidos), `linkScore` 0..2: `+1.0` se `teamOrigin` igual, `+0.5` se `region` igual, `+0.5` se `country` igual. Por slot (0..3): soma das arestas + `+1.0` se a role da carta encaixa no slot. Total = `min(15, Σ perSlot)`. Multiplicador de sim = `0.9 + (total/15)*0.2` (chem 0 = 0.90×, chem 15 = 1.10×). Agrupamento é **teamOrigin > region > country**.

| Conceito | Modelo | Arquivo |
|---|---|---|
| Carta mestre | `ButCard {id, playerRealId, nick, country, region, role, teamOrigin, rarity, ovr, attrs(27), seasonTag, mintCap, mintedCount}` | `engine-core/but/types.ts`, `cards.ts` |
| Cópia possuída | `ButInventoryItem {id, userId, cardId, serial, acquiredVia, locked, lockedRefId, untradeable}` | `types.ts` |
| Raridades (21) | `RarityInfo {id, assetSlug, tier(1-16), ovrMin/Max, bucket(bronze/silver/gold/special), color}` | `rarities.ts` |
| Química | `ChemistryResult {perSlot[], edges[], total(0-15), multiplier}` | `chemistry.ts` |
| Perfil | `ButUserProfile {coins, coinsEarned, gems, elo, peakElo, w/l/d, currentStreak, ...}` | `types.ts` |

**Derivação de stats** (`cards.ts`): `stat99 = round((attr20-1)*94/19 + 5)`; `kill=avg(aim,tap,headshot)`, `aim=avg(aim,aimMovement,crosshair)`, `mov=avg(apm,reflexes,stamina)`, `sense=avg(gameSense,anticipation,vision,positioning)`, `clutch=avg(composure,concentration,offSpike)`, `util=avg(preAim,offAngles,teamwork,communication)`. `OVR = kill·.22 + aim·.20 + sense·.20 + clutch·.15 + util·.13 + mov·.10`.

### 2.2 Pacotes / Roleta / Economia

**Odds de pacote (coins), seed em `012_but_core.sql`):**

| Pack | Custo | Cartas | Garantia | Pesos (raridade:peso) principais |
|---|---|---|---|---|
| bronze | 5.000 | 5 | 1 silver | nonrare-bronze:45, rare-bronze:25, nonrare-silver:20, rare-silver:8, gold:2 |
| silver | 15.000 | 5 | 1 gold | nonrare-silver:40, rare-silver:25, gold:32, if:3 |
| gold | 35.000 | 7 | 2 gold | nonrare-gold:55, rare-gold:30, if:13, motm:2 |
| premium | 75.000 | 11 | 3 rare-gold | gold:80, if/motm/hero/tots:~19, legend:0.4, bluered:0.1 |
| electric | 150.000 | 12 | 5 rare-gold | rare-gold:55, if-gold:15, motm:8, hero:6, tots:8, legend:6, toty:1.5 |
| icon (gems) | 1700g | pick 1 de 3 | 1 legend | legend:95, toty:5 |

**Algoritmo de roll** (`server/but/packs.ts`): `crypto.randomBytes(32)` server_seed → floats de 4 bytes → `rollRarity` (weighted pick) → garantias primeiro (bucket resolve sub-pesos), resto por pesos → `pickCardOfRarityWithFallback` (query `but_cards` por raridade + `RARITY_FALLBACK_CASCADE` para garantir a garantia) → mint (`minted_count++`, insere inventory com serial). **Pick-packs** (options_count>0): rola N opções, escreve `but_pack_pending` (TTL 10min), usuário escolhe; expirados são auto-resolvidos no `GET /pending`.

**Roleta (100% cliente, portável):** `rouletteStrip.ts` (`buildRouletteStrip` — 28 cartas, target em `length-6`, fillers 75/25 nick-pool/donor, OVR mutado ±3, PRNG mulberry32 opcional por seed) + `CardRoulette.tsx` (transição CSS `translate3d`, easing `cubic-bezier(0.08,0.82,0.17,1)`, 4000ms, pulse colorido só ao parar, `prefers-reduced-motion` → snap) + `PackSealAnimation.tsx` (state machine idle → tearing → onOpen).

**Quick-sell** (`quicksell.ts`, puro): `base = QUICKSELL_BASE[rarity]` (25 bronze → 20k toty) × `(1 + clamp((ovr-75)*0.05, 0, 0.5))` × `(isDuplicate ? 1 : 0.7)`. Única (1ª cópia) vende 70% — incentiva guardar únicas, vender dupes.

**Moedas.** Duas: **coins** (soft, jogadas — 20k inicial, wins/quicksell/daily) e **gems** (hard, **dinheiro real via Stripe**). Swap gems→coins com taxa crescente (5 tiers, 480→1000 coins/gem). `coinsEarned` (mig 022) é um ledger anti-lavagem (os 20k de onboarding não contam → não podem ser movidos em trade/market).

**Daily rewards.** (A) **Streak login** 7 dias: `[500,750,1000,1500,2000,3000,5000]` coins, dia 7 +5 gems; miss = hard reset ao dia 1. (B) **Pack free diário**: 1 jogador/dia (10% "star" OVR 73-76, 90% "base" 65-72).

Arquivos: `utils/rouletteStrip.ts`, `components/CardRoulette.tsx`, `PackSealAnimation.tsx`, `QuickSellModal.tsx`, `DailyRewardModal.tsx`, `server/but/packs.ts`, `quicksell.ts`, `constants.ts`, `market.ts`.

### 2.3 Matchmaking / Partida online

**Duas rotas** convergem no mesmo `but_matches`: **(A) ranqueada PvP** (`but_matchmaking_queue` + `matchmakingWorker` de 2s, janela ELO `50 + 50*relax` até ±350, anti-rematch 30min, anti-feed same-IP); **(B) NPC instantânea** (`POST /matchmaking/test-npc`) — `buildNpcSnapshot(targetOvr)` puxa 5 cartas ±8 OVR por role, insere `is_npc=1`, `phase='ban'`.

**State machine da partida ao vivo** (`liveMatch.ts`, 4 fases, timer-driven off `Date.now()`, restart-safe):
- **ban**: pool de 7 mapas, jogador bane primeiro alternando; NPC bane o "meio" da lista (`chooseNpcBan`). Sobra 1 → transição.
- **agent-pick**: jogador escolhe 5 agentes filtrados por role do slot (Valorant); NPC já decidido, revelado 1/700ms (cosmético).
- **playing**: worker de 1s, `homeRoundProb = ovrH/(ovrH+ovrA) + ruído`, **clampado [0.25,0.75]**; `rngForRound(seed, round)` decide; first-to-13, cap 24; 2-3 eventos de **narração** por round (`narration.ts`, RNG separada) viram chat — é a UI principal de "assistir".
- **ended**: `finalizeMatch` credita ELO+coins UMA vez (`rewards_granted` CAS). NPC win = 50 coins fixo; cap diário de reward de IA.

`MatchmakingStatus` = idle | queued | matched. `LiveState` = `{phase, mapPool, bans, currentMap, currentRound, homeScore, awayScore, roundEndsAt, rounds[], homeAgents, awayAgents, phaseDeadline, winner}`. Transporte: WS `/ws/but` (`join_match`, `live_update`, `live_chat`, `live_ended`) + REST catch-up + watchdogs de cliente.

Arquivos: `server/but/matchmaking.ts`, `matchmakingWorker.ts`, `liveMatch.ts`, `sim.ts`, `narration.ts`, `elo.ts`, `wsTrade.ts`; `pages/MatchLive.tsx`, `components/AgentPickPhase.tsx`, `LiveScoreboardPanel.tsx`.

### 2.4 Ranks / Títulos / Progressão

**Ladder** (`engine-core/but/ranks.ts`, puro): 25 divisões = 8 tiers (Iron→Immortal) × 3 (I/II/III) + Radiant. `getRankByElo`, `getNextRank`, `progressInDivision` (0-100%, a "barra de XP"), `eloToNextRank`. **ELO** (`elo.ts`): `computeEloAndRewards` (start 1000, K=15, cap ±30, anti-swing em diff>500, `streakBonus` +250 coins a cada 3ª win).

**Seasons** (`seasons.ts`, 90 dias, rollover admin): snapshot top-100, **soft-reset** `newElo = 1000 + (elo-1000)*0.5`, reset streak, concede títulos Top-1/2/3 + carta reward `tots-gold` untradeable ao top-100.

**Títulos** (`titles.ts`): catálogo `but_titles`, usuário ganha vários (`but_user_titles`) e equipa UM. `TitleBadge.tsx` renderiza chip com glow por tier (1-5). Grant helpers respeitam `max_holders` e auto-equipam o 1º título.

| Loop | Cadência | Recompensa |
|---|---|---|
| Daily | 7 dias | 500→5000 coins, +5 gems dia 7 |
| Weekly | wins PvP, reset seg 00:00 UTC | w10→750c, w25→1500c, w50→pack card |
| Seasonal | trimestral | títulos + carta + soft-reset ELO |

**Onboarding** (`OnboardingFlow.tsx` + `onboarding.ts`): 3 telas fullscreen — Welcome → escolher 1 de 5 formações → reveal 3D flip das 5 cartas iniciais; gate por `onboarding_completed`.

### 2.5 Páginas / Navegação

15 páginas lazy sob `/online/*` dentro de UM `OnlineLayout` (react-router v6): Hub, Club (coleção), SquadBuilder, Leaderboard, TradeUps, Store, Marketplace, Trade, MatchOnline, MatchLive, PlayerPage, UserProfile, Titles, PaymentSuccess/Cancel. `OnlineLayout` = gatekeeper (auth → `/login?next`; onboarding gate) + shell com drivers globais (matchmaking poll, pending-pick modal, trade-invite listener, currency FX, daily popup). `OnlineTopBar` = 5 tabs (Hub/Club/Market/Ranked/Ranking) + chips de coins/gems/ELO + season strip + menu de sistema. Fonte de dados = `ButMeResponse` (`GET /api/but/me`).

### 2.6 Backend / Persistência

**Thin client / fat server.** REST (`butRequest`, JWT Bearer, Idempotency-Key em mutações financeiras) + WS singleton. MySQL 8/9, 28 migrations. Objetivo declarado: *"Save offline e BUT são MUNDOS SEPARADOS — fecha o vetor 'mexo no localStorage e me dou OVR 99'."* — o oposto do modelo client-authoritative do MAJOR//CS.

Tabelas: `but_users`, `but_cards`, `but_inventory`, `but_squads`, `but_packs`, `but_pack_openings/pending`, `but_market_listings/bids`, `but_trades/trade_rooms`, `but_matches/match_events`, `but_matchmaking_queue`, `but_seasons`, `but_daily_rewards/weekly_progress`, `but_titles/user_titles`, `but_payments`, `but_audit_log`. 3 workers de fundo (matchmaking 2s, live 1s, market 30s).

---

## 3. Dependências de backend / online / dinheiro real

Tudo abaixo é **server-authoritative, socket-based, ou IAP de dinheiro real** — NÃO pode ser copiado como está para single-player:

1. **Dinheiro real (Stripe)** — `POST /payments/checkout`, webhook que é a ÚNICA via de crédito de gems, `but_payments`. **Impossível offline.**
2. **Matchmaking PvP** — fila + worker de 2s que pareia dois humanos por ELO. Sem 2º humano offline.
3. **Validação/anti-cheat de partida** — servidor re-roda a sim e compara hash (`submit-result`); shadow-ban, cheat-strikes, anti-feed same-IP/rematch, coin-laundering. Sem sentido quando o jogador é dono da máquina.
4. **Trades P2P + salas ao vivo + lobby chat** — `but_trades`, `but_trade_rooms`, WS, invites. Exigem 2 usuários vivos.
5. **Worker de partida NPC ao vivo** — tick 1s + broadcast WS. A LÓGICA é reutilizável; o worker+socket não.
6. **Sessões server-side + rate-limit por usuário** — `sessions`, `butRateLimit`.
7. **Cron/workers** (matchmaking 2s, live 1s, market 30s, auto-resolve de pending).
8. **Leaderboard/busca/perfis globais entre usuários reais + seasons de população compartilhada.**
9. **Mint caps / serial numbers globais** (escassez só faz sentido num DB multi-usuário).
10. **Anti-lavagem `coinsEarned`, `coins_earned` ledger.**

**O que NÃO precisa de servidor (já é puro em engine-core):** química, derivação de stats, OVR, mapa de raridade, quicksell, rank-por-ELO, `rollRarity`/garantias/fallback, `computeEloAndRewards`, e toda a camada de reveal (`rouletteStrip`, `CardRoulette`, `PackSealAnimation`).

---

## 4. Proposta MAJOR//CS: **"Ultimate Squad"** (nome provisório)

Um modo **single-player, offline-first** que preserva a dopamina do FUT (abrir pacote → colecionar → montar squad → grindar rank) mas 100% dentro do nosso jogo. **Uma moeda soft** (`credits`) ganha jogando; **zero gems / zero dinheiro real** (jogo é free / pago vitalício). Cartas vêm do **dataset real CS2 2026** (`CS2_REAL_2026` + `BASE_TEAMS`).

> ⚠️ **Já existe base no repo.** Há um modo online determinístico P2P (`src/state/online.ts`, `UltimateRuleset` inclui `gauntlet`) com **PackDraft**, **FutCard/UltimatePlayerCard**, **OnlineGauntlet**, MMR ranks (`ONLINE_RANKS`), e `onlineData.ts`. O que **falta** é o loop de **coleção persistente**: hoje o draft é efêmero (monta na hora e joga); não existe **inventário de cartas que você possui e mantém entre sessões**, nem economia de pacotes comprados com moeda acumulada. **Ultimate Squad = adicionar a camada de inventário/economia persistente por cima do que já existe**, reusando PackDraft/FutCard/gauntlet/match engine.

### Chemistry model CS-apropriado

Reaproveitar a fórmula do BUT mas com nossos eixos: por aresta do pentagrama, `+1.0` se **teamOrigin igual** (org real 2026 do jogador), `+0.5` se **region igual** (usar `src/data/regions.ts`), `+0.5` se **country igual** (`player.country`). `+1.0` de role-fit usando nossos **`subRoles`** (`src/engine/subRoles.ts` — `dominantSubRole`/`subRoleStars`) e `compositionPenalty` já existente para punir composições ruins. Multiplicador injetado como modificador de força de time (análogo ao `chemistryMatchModifier` de `src/engine/chemistry.ts`, que já mapeia chem→modifier de partida).

### Mapa BUT → equivalente offline

| Mecânica BUT | Equivalente Ultimate Squad (offline) | Reuso |
|---|---|---|
| `but_cards` catálogo MySQL | Cartas derivadas em runtime de `CS2_REAL_2026`+`BASE_TEAMS` (uma base por jogador + variantes especiais curadas). Raridade por `playerOvr` tiers. | `onlineData.buildPool`, `ratings.playerOvr` |
| `but_inventory` server | `inventory: OwnedCard[]` no save (localStorage). `{id(uuid), cardKey, serial?, acquiredVia, locked:'squad'|null}` | `careerSaves`, `cloud.ts` |
| Raridades (21) | 3-5 tiers reskin CS (`FutCard` já tem icon/gold/neutral por OVR); expandir p/ special (Major-winner/Top20). | `FutCard.tsx`, `UltimatePlayerCard` |
| Química (team/region/country/role) | Idêntica, com nossos eixos + subRoles | `chemistry.ts`, `subRoles.ts`, `regions.ts` |
| Pacotes + odds + garantias | `rollRarity`/garantias/fallback portados puros; PRNG seeded (`makeRng`) em vez de `crypto`; seed gravado no save | `engine/rng.ts`, `PackDraft` |
| Roleta reveal | Portar `CardRoulette`+`PackSealAnimation` OU estender a animação de pack que o `PackDraft` já usa | `PackDraft`, `cards.tsx` |
| Quick-sell | `quicksell.ts` portado verbatim; `QuickSellModal` no padrão `Modal` | `ds/Modal.tsx` |
| Coins (soft) | `credits` no save, ganhos por partida/quicksell/daily/SBC | `gameStore`, achievements |
| Gems (real money) | **REMOVIDO.** Sem 2ª moeda ou moeda de milestone earnable | — |
| Daily reward | `computeNextDailyDay` + tabela portados, driven por `Date.now()` + `lastClaim` no save | `useDailyReward` (port) |
| Matchmaking PvP | **REMOVIDO.** Gerador de squad IA no ELO do jogador | `OnlineGauntlet.buildOpp` |
| Partida (ban→play→end) | `createMapSim`/`simulateSeries` client-side + veto real; sem WS/worker | `engine/match.ts`, `veto.ts` |
| ELO/rank ladder | `computeEloAndRewards`-like local + ranks; ou estender `ONLINE_RANKS`/MMR | `onlineData.ONLINE_RANKS`, `MatchReplay` |
| Títulos | `TITLES` const estático; ownership = `Set<slug>` no save; unlock por conquista absoluta | `StreakBadge`/`UserBadges` |
| Seasons | Clock check no load: `now>endsAt` → soft-reset + season title local | saveMigrations |
| Marketplace/Trade P2P | **REMOVIDO** (ou "bazar IA" opcional fase tardia) | — |
| SBC (novo) | Desafios "monte time X → ganhe recompensa" (consome cartas do inventário) | inventário + `compositionPenalty` |

### SBC-style challenges (diferencial)

"Squad Building Challenges": consome N cartas do inventário que satisfaçam requisitos (ex.: "5 brasileiros OVR≥85, química ≥12", "um time inteiro de uma org real", "3 AWPs") → recompensa (carta especial garantida / pack / credits). Puro, offline, reusa `chemistry.ts` + `playerOvr` + `subRoles`. É o sink de duplicatas que dá propósito à coleção.

### Canon a respeitar

Tokens `em-*`/`rtm-*` (nunca cores hard-coded), `DashCard` (`src/components/career/DashCard.tsx`) para painéis e `Modal` (`src/components/ds/Modal.tsx`) para overlays, estado em Zustand (`gameStore`), **save migrations com backfill** (`SAVE_VERSION` em `src/state/saveMigrations.ts`, hoje 15), **sem backend novo** (cloud sync só carrega o mesmo blob opaco).

---

## 5. O que reaproveitamos do que já temos

| Peça existente | Caminho | Uso no Ultimate Squad |
|---|---|---|
| Match engine determinístico | `src/engine/match.ts` (`createMapSim`, `simulateMap`, `simulateSeries`) | Partida vs squad IA, round-a-round real |
| Veto/ban de mapas | `src/engine/veto.ts` (`autoVeto`, `applyVeto`, `VETO_ORDER_BO3`) | Fase de ban (equivalente CS ao ban BUT) |
| RNG seeded | `src/engine/rng.ts` (`makeRng`, `weightedIndex`, `shuffle`, `pick`) | RNG de pacote reproduzível (substitui `crypto.randomBytes`) |
| Dataset CS2 real | `src/data/bo3.ts` (`CS2_REAL_2026`), `src/data/teams.ts` (`BASE_TEAMS`) | Catálogo de cartas |
| Ratings/OVR/valor | `src/engine/ratings.ts` (`playerOvr`, `playerValue`, `buildUserTeam`, `teamSeasonToTTeam`) | OVR da carta, preço estimado, montar TTeam |
| SubRoles | `src/engine/subRoles.ts` (`dominantSubRole`, `subRoleStars`, `compositionPenalty`) | Role-fit da química + penalidade de composição + SBC |
| Química de time | `src/engine/chemistry.ts` (`chemistryMatchModifier`, `chemColor/Label`) | Base do modificador de partida por química |
| **Modo online já existente** | `src/state/online.ts`, `src/components/online/*` | **PackDraft, FutCard/UltimatePlayerCard, OnlineGauntlet, MatchReplay, Ranked1v1, ONLINE_RANKS, buildPool** |
| Card FUT | `src/components/FutCard.tsx`, `online/cards.tsx` | Carta visual (já em tiers icon/gold/neutral por OVR + 6 substats) |
| Gauntlet vs IA | `src/components/online/OnlineGauntlet.tsx` (`buildOpp`) | Gerador de squad IA por alvo de força → ladder |
| Regiões | `src/data/regions.ts` | Eixo `region` da química |
| Avatares procedurais | `PlayerAvatar` em `src/components/ui.tsx` (fallback proc.) | Arte da carta sem foto |
| Weapons icons | `src/assets/weapons` | Flair visual de cards/reveal |
| Save slots + cloud | `src/state/careerSaves.ts` (5 slots, `slotKey`), `src/state/cloud.ts` (last-write-wins) | Persistir Ultimate Squad como chave paralela |
| Migrations | `src/state/saveMigrations.ts` (`SAVE_VERSION=15`, `migrateSave`) | Backfill dos novos campos |
| Achievements/badges | `src/state/achievements.ts`, `StreakBadge`/`UserBadges` | Base dos títulos/unlocks |
| DashCard/Modal | `src/components/career/DashCard.tsx`, `src/components/ds/Modal.tsx` | Layout canônico |

---

## 6. Plano de build faseado

Cada fase é **shippable**. Save-schema: novo bloco `ultimate` no save (chave paralela `rtm-ultimate-v1` OU sub-objeto do save de carreira — decisão em aberto §7). Bump de `SAVE_VERSION` com backfill que inicializa `ultimate` vazio para saves antigos.

```ts
// adição ao schema do save (backfill: {} → default abaixo)
interface UltimateSave {
  onboarded: boolean;
  credits: number;                 // moeda soft única
  inventory: OwnedCard[];          // {id, cardKey, serial?, acquiredVia, locked}
  squads: UltimateSquad[];         // {id, name, formation, slots:[{slot, ownedId, role}], chemistry, avgOvr, active}
  elo: number; peakElo: number; w: number; l: number; streak: number;
  daily: { lastClaim: string|null; streakDay: number };
  packSeedCounter: number;         // p/ RNG reproduzível
  titles: string[]; equippedTitle: string|null;
  season: { startedAt: number; endsAt: number };
  sbcDone: string[];               // ids de SBC completadas
}
```

**P0 — Fundação de dados + inventário (valor↑ risco↓).** Cria `src/engine/ultimate/cards.ts` (deriva cartas de `CS2_REAL_2026`, `cardKey`, raridade por OVR tier reusando `FutCard.futTier`), tipos `OwnedCard`/`UltimateSave`, slice Zustand `src/state/ultimate.ts` (ações puras: `grantCard`, `sellCard`, `spendCredits`), migration (`SAVE_VERSION`+1, backfill). **Sem backend.** Sem UI ainda — só engine + testes (`npm run test:sim`).

**P1 — Pacotes + roleta + Club.** Porta `rollRarity`/garantias/fallback puros para `ultimate/packs.ts` com `makeRng(seed)` (seed de `packSeedCounter++` gravado antes do reveal). Reusa/estende a animação do `PackDraft`. Página **Club** (grid do inventário, filtros raridade/role, quick-sell portado de `quicksell.ts` com `Modal`). Store simples (packs comprados com `credits`). Ganho de credits: plugado em fim de partida da carreira/gauntlet.

**P2 — Squad Builder + química.** Pitch com slots de formação, `SlotPicker` filtra inventário por role, preview de química ao vivo (fórmula BUT com nossos eixos + subRoles), `avgOvr`. Salvar/ativar squad no save. Lock de carta em squad (`locked:'squad'`).

**P3 — Partida vs IA + rank ladder.** Gerador de squad IA (reusa `OnlineGauntlet.buildOpp`), monta `TTeam` (`buildUserTeam`/`teamSeasonToTTeam`), roda `simulateSeries` + `autoVeto`, aplica ELO local (`computeEloAndRewards`-like) + reward. **Fase ban** (nosso `veto.ts`, mapas CS reais). Reusa `MatchReplay` para o round-a-round. Rank ladder reskin (estende `ONLINE_RANKS`). **Sem WS, sem worker** — tudo síncrono no cliente.

**P4 — Daily reward + títulos + onboarding.** `computeNextDailyDay` portado (driven por `Date.now()`+save). `TITLES` const + `Set<slug>` no save + `TitleBadge` reskin (base em `StreakBadge`). `OnboardingFlow` adaptado (escolher formação inicial → 5 cartas → reveal), gate por `ultimate.onboarded`.

**P5 — SBC challenges + season rollover.** `ultimate/sbc.ts` (defs estáticas + validador que consome cartas satisfazendo requisitos via `chemistry`+`playerOvr`+`subRoles`). Season: clock check no load → soft-reset ELO + season title local.

**P6 (opcional, risco↑) — "Bazar IA".** Listagens sintéticas precificadas por `playerValue`/OVR, bids IA em tick de tempo de jogo. Substitui o marketplace P2P. **Cortar se escopo apertar** — SBC + quick-sell já dão sink de duplicatas.

**Como evitamos backend em cada ponto:** RNG seeded no lugar de `crypto`+DB; inventário/perfil/ELO no save (+ cloud opaco); IA no lugar de PvP; sem Stripe (só `credits`); daily por clock local (aceita spoof — é single-player); sem workers (tick só na tela montada); idempotência trivial (mutação + persist single-thread).

---

## 7. Riscos & decisões em aberto

- **Monetização (RESOLVIDO por canon):** jogo é free / pago vitalício → **sem IAP, sem gems, sem dinheiro real**. Uma única moeda `credits` 100% earnable. Todo o eixo Stripe/gems/coinsEarned/anti-lavagem do BUT é **deletado** — em single-player o jogador só engana a si mesmo.
- **Chave de save: bloco no save de carreira vs chave separada `rtm-ultimate-v1`?** Separada isola o modo e simplifica migração, mas duplica a lógica de slot/cloud. Recomendação: **chave paralela** registrada no mesmo pipeline de `cloud.ts` (mesmo `POST /api/cloud-save` opaco), com sua própria versão. **Decidir antes do P0.**
- **Duplicação vs extensão do modo online existente.** `src/state/online.ts` + `online/*` já têm PackDraft/FutCard/gauntlet/MMR. Risco de construir um 2º sistema paralelo. Recomendação: **estender**, não reescrever — Ultimate Squad = camada de coleção persistente por cima do PackDraft/gauntlet, reusando `onlineData`/`FutCard`/`MatchReplay`. **Decidir onde vive o código** (`src/components/online/` vs novo `src/components/ultimate/`).
- **Escopo do reveal:** portar `CardRoulette` do BUT (mais dopamina, mais código) vs estender a animação de pack que o `PackDraft` já tem. Provável: reusar o que existe no P1, considerar CardRoulette como polish tardio.
- **Balanceamento de economia offline:** sem pressão de multiplayer, é fácil inflacionar credits e tornar packs triviais. Precisa de tuning de rewards/custos (cap diário como no BUT, mas relaxado). Risco de "conteúdo acaba rápido" — SBC + season rollover são os loops de retenção.
- **Spoofing de clock/save:** aceito como não-problema em single-player (cloud reconcilia por max-timestamp para não duplicar daily entre dispositivos).
- **Escala do dataset:** ~poucas centenas de jogadores reais 2026 → coleção "completável" rápido demais? Variantes especiais (Base/Top20/Major-winner/histórico via `BASE_TEAMS`) expandem o catálogo sem inventar jogadores.
- **Marketplace/Trade P2P: cortado.** Sem análogo single-player limpo; "bazar IA" é P6 opcional. Não prometer troca entre jogadores.
