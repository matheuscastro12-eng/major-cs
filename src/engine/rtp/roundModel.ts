// RTP overhaul — "Round Model": camada de DRAMATIZAÇÃO honesta do Round Room.
//
// O sim de time roda UMA vez (finishMatch → simulateSeries) e o momentScore é
// INPUT dele. Não há dados por-rodada reais. Então este módulo gera, de forma
// determinística (seed do matchSeed), uma narrativa BO3 plausível: uma sequência
// de ~6 BEATS pivotais (pistol, entry, economia, duelo, retake, clutch, map point),
// cada um com contexto de rodada real (lado, placar, economia, vivos, bomba) que a
// UI renderiza. Cada beat resolve por resolveMoment (inalterado) e alimenta o
// momentScore existente. O placar OFICIAL continua sendo o Scoreboard pós-jogo.

import { makeRng, pick, type Rng } from '../rng';
import { hashStr } from '../../state/hash';
import type { MapId, Role } from '../../types';
import type { MiniGameId } from './minigames';
import {
  generateMoments, generateEntry, generateRetake, generateEconomy, generateIGL,
  generateForcedEco, generateAntiEco, generatePostPlant, generateSaveCall, generateTimeout, generateLastRoundHalf,
  type Moment, type MomentOption, type MomentOutcome,
} from './moments';

export type Side = 'CT' | 'T';
export type BuyTier = 'eco' | 'force' | 'full';
export type BeatKind = 'pistol' | 'entry' | 'economy' | 'duel' | 'igl' | 'retake' | 'clutch' | 'mapPoint'
  | 'forcedEco' | 'antiEco' | 'saveCall' | 'postPlant' | 'timeout' | 'lastHalf';

export interface RoundCtx {
  mapIndex: number;
  map: MapId;
  round: number;             // rodada dentro do mapa
  side: Side;                // seu lado
  score: [number, number];   // [você, eles] ENTRANDO no beat (vivo, atualizado pela sala)
  yourBuy: BuyTier;
  theirBuy: BuyTier;
  alive: [number, number];   // [você, eles]
  bomb: null | { site: 'A' | 'B'; plantedBy: Side; defuseSecs: number };
  kicker: string;            // "ROUND 16 · PISTOL" / "MATCH POINT"
}

export interface BeatSpec {
  kind: BeatKind;
  mapIndex: number;
  map: MapId;
  round: number;             // ALVO da ponte (o round exibido sai do placar)
  side: Side;                // seu lado NO round alvo (derivado do half)
  startSide: Side;           // seu lado no 1º half DESTE mapa (o ctx deriva o lado do round vivo)
  yourBuy: BuyTier;
  theirBuy: BuyTier;
  alive: [number, number];
  bomb: RoundCtx['bomb'];
  moment: Moment;
  // MOMENTO-CHAVE (in-game v15): depois de decidir, você EXECUTA um minigame e a
  // performance move as odds de verdade. Ausente = beat resolve só no roll.
  spotlight?: MiniGameId;
}

export interface FeedRow {
  killer: string; victim: string; weapon: string;
  hs: boolean; opening: boolean; trade: boolean; byHero: boolean; deathOfHero: boolean;
}

const KICKER: Record<BeatKind, string> = {
  pistol: 'PISTOL', entry: 'EXECUÇÃO', economy: 'ECONOMIA', duel: 'ROUND DE GUN',
  igl: 'MID-ROUND CALL', retake: 'RETAKE', clutch: 'CLUTCH', mapPoint: 'MAP POINT',
  forcedEco: 'FORCE-BUY', antiEco: 'ANTI-ECO', saveCall: 'SAVE OU JOGA?',
  postPlant: 'PÓS-PLANT', timeout: 'TIMEOUT TÁTICO', lastHalf: 'FIM DO HALF',
};

// ─────────────────────────────────────────────────────────────────────────────
// Regras de formato do CS2 (MR12): 12 rounds por half, 13 fecha o mapa, 12-12
// abre prorrogação MR3 (blocos de 6, primeiro a +4; 3-3 abre outra).

export const HALF_ROUNDS = 12;
export const WIN_ROUNDS = 13;
const OT_HALF = 3;

const flip = (s: Side): Side => (s === 'CT' ? 'T' : 'CT');

// Lado de quem começou o mapa em `start` no round `round` (1-based). Regulamento:
// troca no intervalo (round 13). Prorrogação (CS2/Valve): o 1º half da OT segue
// no lado do 2º half do tempo normal, troca no intervalo da OT, e a OT seguinte
// começa sem trocar de novo (fica no lado em que terminou).
export function sideAtRound(start: Side, round: number): Side {
  if (round <= HALF_ROUNDS) return start;
  const second = flip(start);
  if (round <= HALF_ROUNDS * 2) return second;
  const h = Math.floor((round - HALF_ROUNDS * 2 - 1) / OT_HALF);   // half da OT (0-based, todas as OTs)
  return Math.floor((h + 1) / 2) % 2 === 0 ? second : start;
}

// ─────────────────────────────────────────────────────────────────────────────
// Plano de beats (7 pivotais) — o roteiro depende do FORMATO:
//   • MD1 (Série do Dia, circuito inicial): os 7 beats no MESMO mapa, em rounds
//     estritamente crescentes (1 · 4-6 · 8-10 · 12 · 14-16 · 17-19 · 20-22 · MP).
//   • MD3/MD5: mapa 1 abre (pistol/abertura/economia), mapa 2 é o miolo (meio +
//     bomba), mapa 3 é o decider (clutch + map point); o 4º/5º do MD5 são
//     virtuais (fecham pela jogada agregada).
// Antes (ENGI-02) o roteiro era único: no MD1 tudo empilhava no mapa 0 com
// rounds 1, 15, 10, 7, 15, 21, 24 (andando pra trás), o "FIM DO HALF" caía no
// round 15 (regra do MR15) e o lado trocava a cada round (i % 2).

export function buildBeatPlan(role: Role, maps: MapId[], matchSeed: number): BeatSpec[] {
  const rng = makeRng((matchSeed ^ 0xbea75) >>> 0);
  const m = maps.length ? maps : (['mirage', 'inferno', 'nuke'] as MapId[]);
  const bo1 = m.length === 1;
  const roleMoments = generateMoments(role); // [pistol, duel, clutch, mapPoint]
  const duel = roleMoments[1];
  const clutch = roleMoments[2];
  const mapPoint = roleMoments[3];
  const pistol = roleMoments[0];

  const buy = (): BuyTier => pick(rng, ['eco', 'force', 'full', 'full', 'full'] as BuyTier[]);

  // IGL chama o mid-round em vez do duelo de rifle (a jogada passa pelo time todo).
  const isIGL = role === 'IGL';
  // VARIEDADE: alguns slots do arco sorteiam a SITUAÇÃO pelo seed — nem toda
  // série tem o mesmo roteiro. Slot de abertura: execução ou último round do
  // half; slot de economia: eco/force/anti-eco/save; slot do meio: duelo, call
  // do IGL ou timeout tático; slot de bomba: retake ou pós-plant 1vX.
  const ecoKind = (['economy', 'forcedEco', 'antiEco', 'saveCall'] as const)[hashStr(`v-eco:${matchSeed}`) % 4];
  const ecoMoment = ecoKind === 'forcedEco' ? generateForcedEco(role)
    : ecoKind === 'antiEco' ? generateAntiEco()
      : ecoKind === 'saveCall' ? generateSaveCall(role)
        : generateEconomy();
  const openKind = hashStr(`v-open:${matchSeed}`) % 3 === 2 ? ('lastHalf' as const) : ('entry' as const);
  const midKind: BeatKind = isIGL ? 'igl' : hashStr(`v-mid:${matchSeed}`) % 3 === 2 ? 'timeout' : 'duel';
  const midMoment = midKind === 'igl' ? generateIGL() : midKind === 'timeout' ? generateTimeout(role) : duel;
  const bombKind = hashStr(`v-bomb:${matchSeed}`) % 2 === 0 ? ('retake' as const) : ('postPlant' as const);
  // arco: pistol → abertura → economia → meio → bomba → clutch → map point.
  // Só o T planta: a bomba é sempre plantedBy 'T' (retake = você CT; pós-plant =
  // você T; clutch com bomba = depende do half).
  const h = (k: string, n: number) => hashStr(`${k}:${matchSeed}`) % n;
  const mid = bo1 ? 0 : 1;
  const late = bo1 ? 0 : m.length > 2 ? 2 : 1;
  const blueprint: Array<{ kind: BeatKind; moment: Moment; mapIndex: number; round: number; bombSide?: Side }> = [
    { kind: 'pistol', moment: pistol, mapIndex: 0, round: 1 },
    openKind === 'lastHalf'
      ? { kind: 'lastHalf', moment: generateLastRoundHalf(role), mapIndex: 0, round: HALF_ROUNDS }
      : { kind: 'entry', moment: generateEntry(role), mapIndex: 0, round: 4 + h('r1', 3) },
    { kind: ecoKind, moment: ecoMoment, mapIndex: 0, round: 8 + h('r2', 3) },
    { kind: midKind, moment: midMoment, mapIndex: mid, round: bo1 ? 14 + h('r3', 3) : 6 + h('r3', 4) },
    { kind: bombKind, moment: bombKind === 'postPlant' ? generatePostPlant() : generateRetake(), mapIndex: mid, round: bo1 ? 17 + h('r4', 3) : 13 + h('r4', 4), bombSide: 'T' },
    { kind: 'clutch', moment: clutch, mapIndex: late, round: bo1 ? 20 + h('r5', 3) : 18 + h('r5', 4), bombSide: 'T' },
    // alvo 24 = a ponte roda até ALGUÉM chegar a 12 (o map point nasce do placar).
    { kind: 'mapPoint', moment: mapPoint, mapIndex: late, round: HALF_ROUNDS * 2 },
  ];
  // cronologia: dentro de cada mapa, rounds estritamente crescentes (o "FIM DO
  // HALF" no 12 vem depois da economia do 8-10). Sort estável por (mapa, round).
  const ordered = blueprint
    .map((b, i) => ({ b, i }))
    .sort((x, y) => x.b.mapIndex - y.b.mapIndex || x.b.round - y.b.round || x.i - y.i)
    .map((x) => x.b);

  // Lado inicial por mapa: pelo seed; no mapa do beat de bomba, o lado que casa
  // com a situação no round alvo (retake = CT, pós-plant = T — ambos no 2º half).
  const startSides: Side[] = m.map((_, mi) => (h(`side${mi}`, 2) === 0 ? 'T' : 'CT'));
  const bombNeeds: Side = bombKind === 'retake' ? 'CT' : 'T';
  const bombRound = blueprint[4].round;
  startSides[mid] = sideAtRound('T', bombRound) === bombNeeds ? 'T' : 'CT';

  // MOMENTOS-CHAVE com execução (minigame): pistol, abertura, clutch e map
  // point sempre; no meio da série, OU o round de gun/call OU o round de bomba
  // (o hash alterna — nem toda partida tem o mesmo roteiro). ~5 execuções por
  // série, cada uma curta e CASADA com a situação (retake = utilitária,
  // pós-plant = segurar o ângulo, entry = prefire).
  const midSpot: BeatKind = hashStr(`spot:${matchSeed}`) % 2 === 0 ? midKind : bombKind;
  const SPOT_GAME: Partial<Record<BeatKind, MiniGameId>> = {
    pistol: 'reaction',     // reflexo decide o pistol
    entry: 'prefire',       // abrir o site = prefire nos ângulos
    duel: 'flick',          // duelo de mira
    igl: 'igl',             // a call certa no mid-round — leitura de radar
    retake: 'nade',         // a utilitária certa abre o retake
    clutch: 'flick',        // o ÚLTIMO duelo do 1vX (a sala só dispara no closing)
    mapPoint: 'tempo',      // segurar o nervo no match point
    timeout: 'igl',         // sair do pause com a leitura certa
    postPlant: 'holdangle', // segurar o ângulo no pós-plant 1vX
    lastHalf: 'prefire',    // o pick de fim de half sai no prefire
    // forcedEco/antiEco/saveCall: decisões puras, sem execução
  };
  const spotFor = (k: BeatKind): MiniGameId | undefined => {
    if (k === 'pistol' || k === 'clutch' || k === 'mapPoint' || k === 'entry' || k === 'lastHalf') return SPOT_GAME[k];
    if (k === midSpot) return SPOT_GAME[k];
    return undefined;
  };

  return ordered.map((b, i): BeatSpec => {
    const yourBuy: BuyTier =
      b.kind === 'pistol' || b.kind === 'saveCall' ? 'eco'
        : b.kind === 'economy' || b.kind === 'forcedEco' ? 'force'
          : b.kind === 'antiEco' ? 'full' : buy();
    const theirBuy: BuyTier =
      b.kind === 'pistol' || b.kind === 'antiEco' ? 'eco'
        : b.kind === 'forcedEco' ? 'full' : buy();
    const alive: [number, number] =
      b.kind === 'clutch' || b.kind === 'postPlant' ? [1, 2 + (hashStr(`a:${i}:${matchSeed}`) % 2)]
        : b.kind === 'retake' ? [3 + (hashStr(`ra:${i}:${matchSeed}`) % 2), 2]
          : [5, 5];
    const bomb = b.bombSide
      ? { site: (hashStr(`s:${i}:${matchSeed}`) % 2 === 0 ? 'A' : 'B') as 'A' | 'B', plantedBy: b.bombSide, defuseSecs: 5 + (hashStr(`d:${i}:${matchSeed}`) % 25) }
      : null;
    const mi = Math.min(b.mapIndex, m.length - 1);
    const startSide = startSides[mi];
    return {
      kind: b.kind, mapIndex: mi, map: m[mi],
      round: b.round, side: sideAtRound(startSide, b.round), startSide, yourBuy, theirBuy, alive, bomb, moment: b.moment,
      spotlight: spotFor(b.kind),
    };
  });
}

// Monta o RoundCtx ao vivo (placar entra da sala; kicker derivado). O round
// exibido deriva do PLACAR REAL do mapa (rounds jogados + 1) — sempre coerente.
export function ctxForBeat(beat: BeatSpec, score: [number, number], isLast: boolean): RoundCtx {
  // O round É o placar somado + 1 — nunca desmente o scorebug (beat.round vira
  // só o ALVO da ponte entre beats). O lado também sai do round vivo (half).
  const round = score[0] + score[1] + 1;
  let kicker = `ROUND ${round} · ${KICKER[beat.kind]}`;
  if (isLast || score[0] === 12 || score[1] === 12) {
    if (score[1] === 12) kicker = 'MATCH POINT — ELES PRECISAM DE 1';
    else if (score[0] === 12) kicker = 'MATCH POINT — VOCÊ FECHA AQUI';
    else if (isLast) kicker = 'ROUND DECISIVO';
  }
  return {
    mapIndex: beat.mapIndex, map: beat.map, round, side: sideAtRound(beat.startSide ?? beat.side, round),
    score, yourBuy: beat.yourBuy, theirBuy: beat.theirBuy, alive: beat.alive, bomb: beat.bomb, kicker,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PONTE ENTRE BEATS (v15): os rounds entre os momentos-chave ACONTECEM — o
// placar avança de forma plausível (viés de momentum/força/último beat).
// Determinístico pelo matchSeed. O fechamento do mapa é da Sala (closeMapFromLive).

export interface LiveScore {
  mapScore: [number, number];       // rounds no mapa atual (você, eles)
  seriesScore: [number, number];    // mapas fechados (você, eles)
  mapIndex: number;
}
export interface Interlude {
  bridged: [number, number];        // rounds trocados desde o último beat
  lines: string[];                  // narrativa "enquanto isso"
  mapClosed: null | { map: MapId; won: boolean; score: [number, number] };
}

export function initialLiveScore(): LiveScore {
  return { mapScore: [0, 0], seriesScore: [0, 0], mapIndex: 0 };
}

// Teto de rounds de cada lado ANTES de um beat com `beatsLeft` beats restantes
// no mapa (contando ele): 13 − beatsLeft, no máximo 12. Por indução nenhum beat
// que NÃO é o último do mapa fecha o mapa (entra com ≤11, sai com ≤12), e o
// último entra com no máximo 12 — o match point legítimo. 12-12 nunca nasce na
// ponte (só a jogada do último beat abre a prorrogação).
export const capBeforeBeat = (beatsLeft: number): number => Math.min(WIN_ROUNDS - 1, WIN_ROUNDS - Math.max(1, beatsLeft));

export function bridgeToBeat(
  live: LiveScore, to: BeatSpec, prevWon: boolean | null,
  // `maps` ficou por compatibilidade: o fechamento de mapa saiu da ponte (é da Sala).
  momentum: number, edge: number, matchSeed: number, maps: MapId[],
  beatsLeftInMap = 1,
): { live: LiveScore; interlude: Interlude | null } {
  const rng = makeRng((matchSeed ^ hashStr(`bridge:${to.kind}:${to.mapIndex}:${to.round}`)) >>> 0);
  // Chance por round da MESMA régua do fechamento (roundPOf), com o momentum
  // como proxy da jogada até aqui + um empurrão do último beat. Antes era
  // edge*0.018 POR ROUND (a régua de MAPA aplicada a cada round): enquanto um
  // roll cego decidia o mapa isso não aparecia, mas com o placar vivo mandando
  // um rival 10 pontos mais forte ganharia ~68% dos rounds da ponte.
  const pWin = Math.max(0.25, Math.min(0.75,
    roundPOf(momentum, edge) + (prevWon == null ? 0 : prevWon ? 0.03 : -0.03)));

  const mapScore: [number, number] = [...live.mapScore];
  const lines: string[] = [];

  // Rounds intermediários até a véspera do beat (round alvo − 1), sob o teto do
  // capBeforeBeat. O ÚLTIMO beat do mapa (map point) para assim que alguém chega
  // a 12: o match point nasce do placar, com o perdedor distribuído (12-5…12-11)
  // em vez de sempre 12-11. Quando o lado sorteado está no teto, a ponte PARA —
  // antes (ENGI-02) o round ia pro OUTRO lado, e quem acabara de perder o beat
  // "emendava" rounds contra um adversário travado em 12. Exceção: o beat de fim
  // de half precisa nascer EXATAMENTE no round 12 (o momento diz "Round 12").
  const cap = capBeforeBeat(beatsLeftInMap);
  const lastOfMap = beatsLeftInMap <= 1;
  const exact = to.kind === 'lastHalf';
  const canInc = (side: number, other: number): boolean =>
    side + 1 <= cap && !(side + 1 >= HALF_ROUNDS && other >= HALF_ROUNDS);
  const target = Math.min(to.round - 1, HALF_ROUNDS * 2 - 1);
  let dy = 0, dt = 0;
  while (mapScore[0] + dy + mapScore[1] + dt < target) {
    const a = mapScore[0] + dy, b = mapScore[1] + dt;
    if (lastOfMap && (a >= HALF_ROUNDS || b >= HALF_ROUNDS)) break;
    const you = rng() < pWin;
    if (you && canInc(a, b)) dy++;
    else if (!you && canInc(b, a)) dt++;
    else if (exact && canInc(a, b)) dy++;
    else if (exact && canInc(b, a)) dt++;
    else break;
  }
  const out: [number, number] = [mapScore[0] + dy, mapScore[1] + dt];
  if (dy + dt > 0) {
    lines.push(dy > dt
      ? `No embalo, vocês emendaram os rounds seguintes: ${dy}–${dt} no período.`
      : dt > dy
        ? `Eles reagiram nos rounds seguintes e puxaram ${dt}–${dy} no período.`
        : `Troca de rounds equilibrada (${dy}–${dt}) até o próximo momento decisivo.`);
  }

  const interlude = dy + dt > 0 ? { bridged: [dy, dt] as [number, number], lines, mapClosed: null } : null;
  return { live: { mapScore: out, seriesScore: live.seriesScore, mapIndex: live.mapIndex }, interlude };
}

// ─────────────────────────────────────────────────────────────────────────────
// FECHAMENTO DO MAPA (O0-30): o placar VIVO manda. A jogada decide o mapa em
// dois lugares, nesta ordem:
//   1. no último beat do mapa, na Sala: vencer em 12-x FECHA 13-x; perder com
//      eles em 12 perde 12-13… (x-13); vencer em 11-12 abre 12-12 (prorrogação).
//   2. quando o último beat não decide, os rounds que faltam são JOGADOS a
//      partir do placar vivo (playOutMap), round a round, com a chance por round
//      derivada da jogada no mapa + força (roundPOf). 12-12 → prorrogação MR3
//      distribuída (16-12, 16-13, 16-14, 19-x…), nunca um 16-14 fixo.
// Antes (ENGI-01/15) um roll cego por mapa decidia o vencedor e o placar vivo só
// era "fundido" depois: vencer o match point e perder o mapa 11-13 acontecia em
// ~1 de cada 3 Séries do Dia, e 1/3 dos mapas fechava 16-14.

// Chance de vencer o MAPA a partir de 0-0 (a régua histórica da jogada): mult
// 0.65 (jogada domina) + edge*0.018 (força desloca). `mapPlay` 0..1 = média dos
// beats do mapa; `edge` = ovr do herói − força do adversário.
export function mapWinPOf(mapPlay: number, edge: number): number {
  return Math.max(0.1, Math.min(0.9, 0.5 + (mapPlay - 0.5) * 0.65 + edge * 0.018));
}

// P(vencer a prorrogação) com chance por round q: bloco de 6, primeiro a 4;
// 3-3 abre outro bloco idêntico → W / (W + L).
function otWinP(q: number): number {
  const r = 1 - q;
  const w = q ** 4 * (1 + 4 * r + 10 * r * r);
  const l = r ** 4 * (1 + 4 * q + 10 * q * q);
  return w / (w + l);
}

// P(vencer o mapa) a partir do placar [a, b] com chance por round q (exato:
// regulamento até 13 + prorrogação). DP iterativa 13×13 — barata o bastante
// pra rodar dentro da busca do roundPOf.
export function mapWinPFrom(score: [number, number], q: number): number {
  const [a0, b0] = score;
  if (a0 >= WIN_ROUNDS && a0 - b0 >= 2) return 1;
  if (b0 >= WIN_ROUNDS && b0 - a0 >= 2) return 0;
  if (a0 >= HALF_ROUNDS && b0 >= HALF_ROUNDS) return otWinP(q);
  const W = WIN_ROUNDS + 1;
  const f = new Float64Array(W * W);   // f[a*W + b], a/b = rounds já vencidos
  for (let a = WIN_ROUNDS; a >= 0; a--) {
    for (let b = WIN_ROUNDS; b >= 0; b--) {
      let v: number;
      if (a === WIN_ROUNDS) v = b === WIN_ROUNDS ? 0 : 1;
      else if (b === WIN_ROUNDS) v = 0;
      else if (a === HALF_ROUNDS && b === HALF_ROUNDS) v = otWinP(q);
      else v = q * f[(a + 1) * W + b] + (1 - q) * f[a * W + b + 1];
      f[a * W + b] = v;
    }
  }
  return f[Math.min(a0, HALF_ROUNDS) * W + Math.min(b0, HALF_ROUNDS)];
}

// Chance por ROUND que reproduz a chance de mapa da jogada (mapWinPOf) a partir
// de 0-0 — busca binária no mapWinPFrom (monótono em q). Assim a jogada pesa o
// mesmo que antes no mapa inteiro, mas o placar vivo passa a contar. Memo por
// alvo (função pura; o domínio é pequeno — clamp 0.1..0.9).
const ROUND_P_MEMO = new Map<number, number>();
export function roundPOf(mapPlay: number, edge: number): number {
  const target = mapWinPOf(mapPlay, edge);
  const key = Math.round(target * 1e6);
  const hit = ROUND_P_MEMO.get(key);
  if (hit != null) return hit;
  let lo = 0.2, hi = 0.8;
  for (let i = 0; i < 30; i++) {
    const midQ = (lo + hi) / 2;
    if (mapWinPFrom([0, 0], midQ) < target) lo = midQ; else hi = midQ;
  }
  const q = (lo + hi) / 2;
  if (ROUND_P_MEMO.size > 50_000) ROUND_P_MEMO.clear();
  ROUND_P_MEMO.set(key, q);
  return q;
}

export interface MapClose { won: boolean; score: [number, number]; overtimes: number }

// Placar final é válido no CS2? 13-x (x≤11) ou prorrogação (16+3k)-(W−4..W−2).
export function isValidMapScore(score: [number, number]): boolean {
  const w = Math.max(score[0], score[1]), l = Math.min(score[0], score[1]);
  if (w === WIN_ROUNDS) return l <= HALF_ROUNDS - 1;
  if (w < WIN_ROUNDS + OT_HALF || (w - (WIN_ROUNDS + OT_HALF)) % OT_HALF !== 0) return false;
  return l >= w - 4 && l <= w - 2;
}

// O mapa já está decidido no placar vivo (alguém fechou 13-x ou a OT)?
export function mapDecided(score: [number, number]): boolean {
  return isValidMapScore(score);
}

// Joga os rounds que faltam a partir do placar vivo, round a round. Nunca
// encolhe o que a Sala mostrou (só soma). Guarda de morte súbita após 8 OTs.
export function playOutMap(from: [number, number], q: number, rng: Rng): MapClose {
  let [a, b] = from;
  const step = () => { if (rng() < q) a++; else b++; };
  if (mapDecided([a, b])) return { won: a > b, score: [a, b], overtimes: Math.max(0, Math.ceil((Math.max(a, b) - WIN_ROUNDS) / OT_HALF)) };
  while (a < WIN_ROUNDS && b < WIN_ROUNDS && !(a >= HALF_ROUNDS && b >= HALF_ROUNDS)) step();
  if (a === WIN_ROUNDS || b === WIN_ROUNDS) return { won: a > b, score: [a, b], overtimes: 0 };
  // prorrogação: o placar entra empatado (12-12, 15-15…); cada bloco é o 1º a +4.
  let overtimes = 0;
  for (;;) {
    overtimes++;
    const tgt = Math.min(a, b) + 4;
    while (a < tgt && b < tgt && !(a === tgt - 1 && b === tgt - 1)) step();
    if (a === tgt || b === tgt) break;
    if (overtimes >= 8) { step(); break; }
  }
  return { won: a > b, score: [a, b], overtimes };
}

// Fecha UM mapa a partir do placar vivo: decidido pela Sala → é esse; senão os
// rounds restantes são jogados com a chance por round da jogada. Seed POR-MAPA
// (mi) → o mesmo mapa fecha igual na Sala e em qualquer releitura.
export function closeMapFromLive(
  mapPlay: number, edge: number, matchSeed: number, mi: number, live: [number, number],
): MapClose {
  const rng = makeRng((matchSeed ^ 0x5e21e5 ^ ((mi + 1) * 0x9e3779b1)) >>> 0);
  return playOutMap(live, roundPOf(mapPlay, edge), rng);
}

// Mapa sem placar vivo (série pulada, 4º/5º mapa virtual do MD5): jogado de 0-0
// com a MESMA régua — P(vitória) = mapWinPOf(mapPlay, edge) por construção.
export function resolveMapFromPlay(
  mapPlay: number, edge: number, matchSeed: number, mi: number,
): { won: boolean; score: [number, number] } {
  const { won, score } = closeMapFromLive(mapPlay, edge, matchSeed, mi, [0, 0]);
  return { won, score };
}

// média dos `value` dos beats de um mapa (helper compartilhado Sala ↔ card).
export function mapPlayOf(outcomes: MomentOutcome[], beats: BeatSpec[], mapIndex: number, fallback: number): number {
  const vals = outcomes.map((o, i) => ({ v: o.value, mi: beats[i]?.mapIndex })).filter((x) => x.mi === mapIndex).map((x) => x.v);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : fallback;
}

// PLACAR NATURAL de uma série SEM placar vivo (skip): cada mapa pela jogada
// daquele mapa, a série para quando alguém fecha (need). Uma série JOGADA na
// Sala tem a verdade nos liveMaps (o placar vivo pesa), não aqui.
export function resolveRoomSeries(
  role: Role, outcomes: MomentOutcome[], edge: number,
  matchSeed: number, maps: MapId[], bestOf: 1 | 3 | 5,
): { maps: { map: MapId; score: [number, number]; won: boolean }[]; seriesWon: boolean; mapWins: [number, number] } {
  const beats = buildBeatPlan(role, maps, matchSeed);
  const need = Math.ceil(bestOf / 2);
  const allPlay = outcomes.length ? outcomes.reduce((a, o) => a + o.value, 0) / outcomes.length : 0.5;
  const out: { map: MapId; score: [number, number]; won: boolean }[] = [];
  let you = 0, them = 0;
  // joga mapa a mapa até alguém fechar (need). Mapa com beats usa a jogada DAQUELE
  // mapa; mapas extras (ex.: 4º/5º de um BO5, sem beats no plano) usam a agregada.
  const totalMaps = Math.max(maps.length || bestOf, bestOf);
  for (let mi = 0; mi < totalMaps && you < need && them < need; mi++) {
    const mapPlay = mapPlayOf(outcomes, beats, mi, allPlay);
    const { won, score } = resolveMapFromPlay(mapPlay, edge, matchSeed, mi);
    out.push({ map: maps[Math.min(mi, Math.max(0, maps.length - 1))] ?? 'mirage', score, won });
    if (won) you++; else them++;
  }
  // guarda final (pool minúsculo): se não fechou, o último mapa decide.
  if (you < need && them < need && out.length) { if (out[out.length - 1].won) you++; else them++; }
  return { maps: out, seriesWon: you > them, mapWins: [you, them] };
}

// ─────────────────────────────────────────────────────────────────────────────
// Killfeed sintetizado (dramatização local do outcome — NÃO do sim)

const WEAPONS: Record<BuyTier, string[]> = {
  eco: ['Glock-18', 'USP-S', 'Deagle', 'P250'],
  force: ['MAC-10', 'MP9', 'Deagle', 'Tec-9'],
  full: ['AK-47', 'M4A1-S', 'AWP', 'AK-47'],
};

export function feedForOutcome(
  beat: BeatSpec, opt: MomentOption, out: MomentOutcome,
  heroNick: string, oppNicks: string[], rng: Rng,
): FeedRow[] {
  const rows: FeedRow[] = [];
  const wpns = WEAPONS[beat.yourBuy];
  const isClutch = beat.kind === 'clutch';
  const opening = beat.kind === 'entry' || beat.kind === 'pistol';
  const enemies = oppNicks.length ? oppNicks : ['enemy1', 'enemy2', 'enemy3'];

  if (out.result === 'success' || out.result === 'partial') {
    const frags = Math.max(1, out.frags);
    for (let i = 0; i < frags; i++) {
      rows.push({
        killer: heroNick, victim: enemies[(i + (rng() * enemies.length | 0)) % enemies.length],
        weapon: wpns[(rng() * wpns.length) | 0], hs: rng() < (opt.style === 'aggro' ? 0.55 : 0.4),
        opening: opening && i === 0, trade: opt.style === 'safe' && i === 0, byHero: true, deathOfHero: false,
      });
    }
    if (isClutch && out.result === 'success') {
      rows.push({ killer: heroNick, victim: enemies[(rng() * enemies.length) | 0], weapon: 'Knife', hs: false, opening: false, trade: false, byHero: true, deathOfHero: false });
    }
  } else {
    rows.push({
      killer: enemies[(rng() * enemies.length) | 0], victim: heroNick,
      weapon: pick(rng, WEAPONS.full), hs: rng() < 0.5, opening: opening, trade: false, byHero: false, deathOfHero: true,
    });
  }
  return rows;
}

// Pílulas de telemetria do outcome (substituem a frase única).
export function outcomePills(beat: BeatSpec, out: MomentOutcome): string[] {
  const p: string[] = [];
  if (out.frags > 0) p.push(`+${out.frags}K`);
  if (out.openings > 0) p.push('OPENING');
  if (out.clutches > 0) p.push('CLUTCH');
  if (out.deaths > 0) p.push('MORreu'.toUpperCase());
  if (beat.bomb && out.result === 'success' && beat.kind === 'retake') p.push('DEFUSE');
  if (out.result === 'success' && out.frags >= 2) p.push('MULTI-KILL');
  return p.length ? p : ['SEM IMPACTO'];
}
