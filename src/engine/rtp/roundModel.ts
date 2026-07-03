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
  round: number;
  side: Side;
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
// Plano de beats (6-7 pivotais ao longo da BO3)

export function buildBeatPlan(role: Role, maps: MapId[], matchSeed: number): BeatSpec[] {
  const rng = makeRng((matchSeed ^ 0xbea75) >>> 0);
  const m = maps.length ? maps : (['mirage', 'inferno', 'nuke'] as MapId[]);
  const roleMoments = generateMoments(role); // [pistol, duel, clutch, mapPoint]
  const duel = roleMoments[1];
  const clutch = roleMoments[2];
  const mapPoint = roleMoments[3];
  const pistol = roleMoments[0];

  const buy = (): BuyTier => pick(rng, ['eco', 'force', 'full', 'full', 'full'] as BuyTier[]);
  const side = (i: number): Side => (i % 2 === 0 ? 'T' : 'CT');

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
  // arco: pistol → abertura → economia → meio → bomba → clutch → map point
  const blueprint: Array<{ kind: BeatKind; moment: Moment; mapIndex: number; round: number; bombSide?: Side }> = [
    { kind: 'pistol', moment: pistol, mapIndex: 0, round: 1 },
    openKind === 'lastHalf'
      ? { kind: 'lastHalf', moment: generateLastRoundHalf(role), mapIndex: 0, round: 15 }
      : { kind: 'entry', moment: generateEntry(role), mapIndex: 0, round: 4 + (hashStr(`r1:${matchSeed}`) % 3) },
    { kind: ecoKind, moment: ecoMoment, mapIndex: 0, round: 8 + (hashStr(`r2:${matchSeed}`) % 3) },
    { kind: midKind, moment: midMoment, mapIndex: 1, round: 6 + (hashStr(`r3:${matchSeed}`) % 4) },
    { kind: bombKind, moment: bombKind === 'postPlant' ? generatePostPlant() : generateRetake(), mapIndex: 1, round: 13 + (hashStr(`r4:${matchSeed}`) % 4), bombSide: 'T' },
    { kind: 'clutch', moment: clutch, mapIndex: m.length > 2 ? 2 : 1, round: 18 + (hashStr(`r5:${matchSeed}`) % 4), bombSide: 'CT' },
    { kind: 'mapPoint', moment: mapPoint, mapIndex: m.length > 2 ? 2 : 1, round: 24 + (hashStr(`r6:${matchSeed}`) % 4) },
  ];

  // MOMENTOS-CHAVE com execução (minigame): pistol, clutch e map point sempre;
  // no meio da série, OU o round de gun/call OU o retake (o hash alterna — nem
  // toda partida tem o mesmo roteiro). ~4 execuções por série, cada uma curta.
  const midSpot: BeatKind = hashStr(`spot:${matchSeed}`) % 2 === 0 ? midKind : bombKind;
  const SPOT_GAME: Partial<Record<BeatKind, MiniGameId>> = {
    pistol: 'reaction',   // reflexo decide o pistol
    duel: 'flick',        // duelo de mira
    igl: 'memory',        // a call certa no mid-round
    retake: 'spray',      // transferência de spray no retake
    clutch: 'flick',      // o ÚLTIMO duelo do 1vX (a sala só dispara no closing)
    mapPoint: 'tempo',    // segurar o nervo no match point
    timeout: 'memory',    // sair do pause com a leitura certa
    postPlant: 'tempo',   // segurar o nervo no pós-plant 1vX
    // forcedEco/antiEco/saveCall/lastHalf: decisões puras, sem execução
  };
  const spotFor = (k: BeatKind): MiniGameId | undefined => {
    if (k === 'pistol' || k === 'clutch' || k === 'mapPoint') return SPOT_GAME[k];
    if (k === midSpot) return SPOT_GAME[k];
    return undefined;
  };

  return blueprint.map((b, i): BeatSpec => {
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
    return {
      kind: b.kind, mapIndex: Math.min(b.mapIndex, m.length - 1), map: m[Math.min(b.mapIndex, m.length - 1)],
      round: b.round, side: side(b.round), yourBuy, theirBuy, alive, bomb, moment: b.moment,
      spotlight: spotFor(b.kind),
    };
  });
}

// Monta o RoundCtx ao vivo (placar entra da sala; kicker derivado). O round
// exibido deriva do PLACAR REAL do mapa (rounds jogados + 1) — sempre coerente.
export function ctxForBeat(beat: BeatSpec, score: [number, number], isLast: boolean): RoundCtx {
  // O round É o placar somado + 1 — nunca desmente o scorebug (beat.round vira
  // só o ALVO da ponte entre beats).
  const round = score[0] + score[1] + 1;
  let kicker = `ROUND ${round} · ${KICKER[beat.kind]}`;
  if (isLast || score[0] === 12 || score[1] === 12) {
    if (score[1] === 12) kicker = 'MATCH POINT — ELES PRECISAM DE 1';
    else if (score[0] === 12) kicker = 'MATCH POINT — VOCÊ FECHA AQUI';
    else if (isLast) kicker = 'ROUND DECISIVO';
  }
  return {
    mapIndex: beat.mapIndex, map: beat.map, round, side: beat.side,
    score, yourBuy: beat.yourBuy, theirBuy: beat.theirBuy, alive: beat.alive, bomb: beat.bomb, kicker,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PONTE ENTRE BEATS (v15): os rounds entre os momentos-chave ACONTECEM — o
// placar avança de forma plausível (viés de momentum/força/último beat) e mapas
// fecham na transição da BO3. Determinístico pelo matchSeed. É dramatização
// honesta: o resultado OFICIAL da série continua vindo do sim (finishMatch).

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

export function bridgeToBeat(
  live: LiveScore, to: BeatSpec, prevWon: boolean | null,
  momentum: number, edge: number, matchSeed: number, maps: MapId[],
  toIsLastOfMap = false,
): { live: LiveScore; interlude: Interlude | null } {
  const rng = makeRng((matchSeed ^ hashStr(`bridge:${to.kind}:${to.mapIndex}:${to.round}`)) >>> 0);
  const pWin = Math.max(0.25, Math.min(0.75,
    0.5 + (momentum - 0.5) * 0.26 + (prevWon == null ? 0 : prevWon ? 0.05 : -0.05) + edge * 0.006));

  let mapScore: [number, number] = [...live.mapScore];
  let seriesScore: [number, number] = [...live.seriesScore];
  let mapIndex = live.mapIndex;
  const lines: string[] = [];
  let mapClosed: Interlude['mapClosed'] = null;

  // Transição de mapa: fecha o atual. Na BO3 a dramaturgia garante o DECIDER —
  // se alguém já tem 1 mapa, o outro leva este (senão os beats do mapa 3 não
  // existiriam). No 1º fechamento, quem está na frente (e embalado) leva.
  if (to.mapIndex > mapIndex) {
    let won: boolean;
    if (seriesScore[0] > seriesScore[1]) won = false;
    else if (seriesScore[1] > seriesScore[0]) won = true;
    else won = rng() < Math.max(0.2, Math.min(0.8, 0.5 + (mapScore[0] - mapScore[1]) * 0.07 + (momentum - 0.5) * 0.2));
    const loserCur = won ? mapScore[1] : mapScore[0];
    const loserFinal = Math.max(loserCur, Math.min(11, 5 + Math.floor(rng() * 7)));
    const final: [number, number] = won ? [13, loserFinal] : [loserFinal, 13];
    seriesScore = won ? [seriesScore[0] + 1, seriesScore[1]] : [seriesScore[0], seriesScore[1] + 1];
    mapClosed = { map: maps[Math.min(mapIndex, maps.length - 1)], won, score: final };
    lines.push(won
      ? `Vocês fecharam o mapa ${final[0]}–${final[1]} — série ${seriesScore[0]}–${seriesScore[1]}.`
      : `Eles levaram o mapa ${final[1]}–${final[0]} — série ${seriesScore[0]}–${seriesScore[1]}.`);
    mapIndex = to.mapIndex;
    mapScore = [0, 0];
  }

  // Rounds intermediários até a véspera do beat. Alvo ≤ 23 rounds jogados (12-11
  // = MATCH POINT legítimo; nunca 12-12 fantasma). Beat que NÃO é o último do
  // mapa não pode NASCER com o líder em 12 (vencer o beat fecharia o mapa cedo
  // demais) — cap 11; vitória leva a 12 e o match point fica pro beat final.
  const cap = toIsLastOfMap ? 12 : 11;
  const played = mapScore[0] + mapScore[1];
  const target = Math.min(to.round - 1, 23);
  const n = Math.max(0, target - played);
  let dy = 0, dt = 0;
  for (let i = 0; i < n; i++) {
    const you = rng() < pWin;
    if (you && mapScore[0] + dy < cap) dy++;
    else if (!you && mapScore[1] + dt < cap) dt++;
    else if (mapScore[0] + dy < cap) dy++;
    else if (mapScore[1] + dt < cap) dt++;
  }
  mapScore = [mapScore[0] + dy, mapScore[1] + dt];
  if (dy + dt > 0) {
    lines.push(dy > dt
      ? `No embalo, vocês emendaram os rounds seguintes: ${dy}–${dt} no período.`
      : dt > dy
        ? `Eles reagiram nos rounds seguintes e puxaram ${dt}–${dy} no período.`
        : `Troca de rounds equilibrada (${dy}–${dt}) até o próximo momento decisivo.`);
  }

  const interlude = (dy + dt > 0 || mapClosed) ? { bridged: [dy, dt] as [number, number], lines, mapClosed } : null;
  return { live: { mapScore, seriesScore, mapIndex }, interlude };
}

// ─────────────────────────────────────────────────────────────────────────────
// RESULTADO NATURAL DA SÉRIE (v16b): cada MAPA é decidido pela SUA jogada naquele
// mapa (a média dos beats daquele mapa), com a força do adversário deslocando. A
// série PARA quando alguém fecha (need mapas) → placar NATURAL: 2-0 (varreu), 2-1
// (foi ao decider), 0-2, 1-2 — e 3-0/3-1/3-2 no BO5. É a FONTE DA VERDADE: a Sala
// revela isto (fecha mapa a mapa, para quando decide) e o card oficial usa o mesmo
// → nunca divergem. Puro/determinístico. `edge` = ovr do herói − força do adversário.
// Resultado de UM mapa a partir da SUA jogada NAQUELE mapa. Seed POR-MAPA (mi) →
// a Sala pode fechar cada mapa independente e bater EXATAMENTE com o card (ambos
// chamam esta função com o mesmo mapPlay/edge/seed). `mapPlay` 0..1 = média dos
// beats do mapa. mult 0.65 (jogada domina) + edge*0.012 (força desloca).
export function resolveMapFromPlay(
  mapPlay: number, edge: number, matchSeed: number, mi: number,
): { won: boolean; score: [number, number] } {
  const rng = makeRng((matchSeed ^ 0x5e21e5 ^ ((mi + 1) * 0x9e3779b1)) >>> 0);
  const p = Math.max(0.1, Math.min(0.9, 0.5 + (mapPlay - 0.5) * 0.65 + edge * 0.012));
  const won = rng() < p;
  const margin = Math.abs(mapPlay - 0.5) * 12 + Math.abs(edge) * 0.15;
  const loser = Math.max(3, Math.min(11, Math.round(11 - margin + (rng() * 4 - 2))));
  return { won, score: won ? [13, loser] : [loser, 13] };
}

// média dos `value` dos beats de um mapa (helper compartilhado Sala ↔ card).
export function mapPlayOf(outcomes: MomentOutcome[], beats: BeatSpec[], mapIndex: number, fallback: number): number {
  const vals = outcomes.map((o, i) => ({ v: o.value, mi: beats[i]?.mapIndex })).filter((x) => x.mi === mapIndex).map((x) => x.v);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : fallback;
}

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
