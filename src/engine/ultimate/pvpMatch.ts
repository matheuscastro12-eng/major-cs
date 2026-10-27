// [F2] DUELO PvP DO ULTIMATE RESOLVIDO NO SERVIDOR — motor PURO compartilhado.
//
// O servidor (server/ult-match.ts) guarda este estado (jsonb) e chama
// resolvePvpBeat quando os DOIS lados decidiram (ou o prazo venceu). O cliente
// usa as MESMAS funções só pra mostrar odds e textos: o que a UI mostra é o que
// rola (pvpWinP é a fórmula do roll, nada cosmético).
//
// Reuso do engine da Sala (vocabulário do CONTEXT.md):
//   • Beats: buildBeatPlan (roteiro MD1 de 7 momentos-chave no mesmo mapa).
//   • Ponte: bridgeToBeat entre beats; teto capBeforeBeat; Placar vivo manda.
//   • Fechamento: no último beat, 12-x vencido fecha 13-x; senão
//     closeMapFromLive joga o resto a partir do placar vivo (mesma régua).
//   • Contra-jogo: o mesmo trio de estilos (aggro/safe/smart) e o mesmo
//     COUNTER_DELTA da Postura. Na Sala a postura é do adversário-IA (tabela
//     STYLE_VS_POSTURE, não simétrica); no PvP os DOIS escolhem ao mesmo tempo,
//     então o confronto precisa ser antissimétrico: pedra-papel-tesoura —
//     agressivo atropela quem senta passivo, passivo segura e esvazia o setup,
//     setup (crossfire) pune quem vem pra cima. Nenhum estilo domina: contra
//     um rival que escolhe ao acaso, todos têm a mesma chance.
//
// Determinismo: nada de relógio nem Math.random. O roll de cada beat sai da
// seed da partida + índice do beat; a escolha automática de quem não decidiu
// também (sorteio uniforme semeado — imprevisível, então neutra em média).
import { makeRng, type Rng } from '../rng.js';
import {
  buildBeatPlan, bridgeToBeat, closeMapFromLive, ctxForBeat, beatsLeftInMap, initialLiveScore, mapDecided,
  HALF_ROUNDS, WIN_ROUNDS, type BeatSpec, type LiveScore,
} from '../rtp/roundModel.js';
import { COUNTER_DELTA, type MomentStyle } from '../rtp/moments.js';
import type { MapId } from '../../types.js';

export const PVP_MATCH_VERSION = 1 as const;
export type PvpStyle = MomentStyle;
export const PVP_STYLES: readonly PvpStyle[] = ['aggro', 'safe', 'smart'];
export type PvpSide = 0 | 1;

export const PVP_STYLE_LABEL: Record<PvpStyle, string> = { aggro: 'Agressivo', safe: 'Passivo', smart: 'Setup' };

// X vence BEATS[X] (pedra-papel-tesoura entre os dois jogadores).
const BEATS: Record<PvpStyle, PvpStyle> = { aggro: 'safe', safe: 'smart', smart: 'aggro' };

// Pesos da fórmula (exportados pra UI e testes lerem da MESMA fonte).
export const PVP_CLASH_WEIGHT = COUNTER_DELTA * 1.5;   // 0.18: ler o rival vale ~68%
export const PVP_EDGE_PER_POINT = 0.01;                // 1 ponto de força = 1%
export const PVP_EDGE_CAP = 0.12;                      // força nunca decide sozinha
export const PVP_MOMENTUM_WEIGHT = 0.1;                // ±5% no extremo
export const PVP_P_MIN = 0.1;
export const PVP_P_MAX = 0.9;

const PVP_MAPS: MapId[] = ['mirage', 'inferno', 'nuke', 'ancient', 'anubis', 'dust2', 'train'];
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export interface PvpSquadIn { name: string; cards: { ovr: number }[]; chem: number }

export interface PvpBeatRecord {
  idx: number;
  kind: BeatSpec['kind'];
  styles: [PvpStyle, PvpStyle];
  auto: [boolean, boolean];      // escolha automática (prazo vencido)
  pA: number;                    // P(lado 0 vencer) usada no roll
  roll: number;
  winner: PvpSide;
  scoreAfter: [number, number];  // placar canônico (lado 0, lado 1) após o beat
}

export interface PvpMatchState {
  v: typeof PVP_MATCH_VERSION;
  seed: number;
  map: MapId;
  names: [string, string];
  strength: [number, number];    // OVR médio + química (pontos)
  idx: number;                   // beat corrente (== beats.length quando acabou)
  score: [number, number];       // placar vivo do mapa ENTRANDO no beat corrente
  momentum: number;              // 0..1, > 0.5 = lado 0 embalado
  bridged: [number, number] | null; // Ponte até o beat corrente (rounds trocados)
  history: PvpBeatRecord[];
  status: 'live' | 'done';
  winner: PvpSide | null;
  finalScore: [number, number] | null;
}

export function strengthOf(sq: PvpSquadIn): number {
  const cards = sq.cards.length ? sq.cards : [{ ovr: 60 }];
  const avg = cards.reduce((a, c) => a + clamp(Number(c.ovr) || 60, 1, 99), 0) / cards.length;
  return Math.round((avg + (clamp(Number(sq.chem) || 1, 0.8, 1.2) - 1) * 20) * 10) / 10;
}

// Plano de beats determinístico: regenerado da seed (não vai no jsonb).
const PLAN_MEMO = new Map<string, BeatSpec[]>();
export function pvpBeats(s: Pick<PvpMatchState, 'seed' | 'map'>): BeatSpec[] {
  const key = `${s.seed}:${s.map}`;
  let plan = PLAN_MEMO.get(key);
  if (!plan) {
    plan = buildBeatPlan('Rifler', [s.map], s.seed);
    if (PLAN_MEMO.size > 500) PLAN_MEMO.clear();
    PLAN_MEMO.set(key, plan);
  }
  return plan;
}

const edgeOf = (s: PvpMatchState) => s.strength[0] - s.strength[1];

export function createPvpMatch(input: { seed: number; squads: [PvpSquadIn, PvpSquadIn] }): PvpMatchState {
  const seed = input.seed >>> 0 || 1;
  const map = PVP_MAPS[Math.floor(makeRng((seed ^ 0x6d6170) >>> 0)() * PVP_MAPS.length)];
  const base: PvpMatchState = {
    v: PVP_MATCH_VERSION, seed, map,
    names: [String(input.squads[0].name || 'Time A').slice(0, 24), String(input.squads[1].name || 'Time B').slice(0, 24)],
    strength: [strengthOf(input.squads[0]), strengthOf(input.squads[1])],
    idx: 0, score: [0, 0], momentum: 0.5, bridged: null, history: [], status: 'live', winner: null, finalScore: null,
  };
  return openBeat(base, null);
}

// Ponte até o beat corrente (lado 0 = "você" do bridgeToBeat).
function openBeat(s: PvpMatchState, prevWonA: boolean | null): PvpMatchState {
  const beats = pvpBeats(s);
  const live: LiveScore = { ...initialLiveScore(), mapScore: [...s.score] as [number, number] };
  const { live: out, interlude } = bridgeToBeat(live, beats[s.idx], prevWonA, s.momentum, edgeOf(s), s.seed, [s.map], beatsLeftInMap(beats, s.idx));
  return { ...s, score: out.mapScore, bridged: interlude ? interlude.bridged : null };
}

/** -1, 0 ou +1: o estilo `a` contra o estilo `b`. */
export function clashOf(a: PvpStyle, b: PvpStyle): -1 | 0 | 1 {
  if (a === b) return 0;
  return BEATS[a] === b ? 1 : -1;
}

/** P(lado 0 vencer o beat) com as duas escolhas — a MESMA conta do roll. */
export function pvpWinP(s: PvpMatchState, a: PvpStyle, b: PvpStyle): number {
  const edge = clamp(edgeOf(s) * PVP_EDGE_PER_POINT, -PVP_EDGE_CAP, PVP_EDGE_CAP);
  const p = 0.5 + clashOf(a, b) * PVP_CLASH_WEIGHT + edge + (s.momentum - 0.5) * PVP_MOMENTUM_WEIGHT;
  return Math.round(clamp(p, PVP_P_MIN, PVP_P_MAX) * 1000) / 1000;
}

/** Odds do ponto de vista de `side`: para cada estilo meu, a chance contra cada estilo dele. */
export function pvpOddsFor(s: PvpMatchState, side: PvpSide): Record<PvpStyle, Record<PvpStyle, number>> {
  const out = {} as Record<PvpStyle, Record<PvpStyle, number>>;
  for (const mine of PVP_STYLES) {
    out[mine] = {} as Record<PvpStyle, number>;
    for (const theirs of PVP_STYLES) {
      const pA = side === 0 ? pvpWinP(s, mine, theirs) : pvpWinP(s, theirs, mine);
      out[mine][theirs] = side === 0 ? pA : Math.round((1 - pA) * 1000) / 1000;
    }
  }
  return out;
}

/** RNG do beat corrente (pré-comprometido pela seed + índice). */
export function beatRng(s: PvpMatchState): Rng {
  return makeRng((s.seed ^ Math.imul(s.idx + 1, 0x9e3779b1) ^ 0x50765) >>> 0);
}

/** Escolha automática de quem não decidiu no prazo: sorteio uniforme semeado. */
export function defaultStyle(s: PvpMatchState, side: PvpSide): PvpStyle {
  const u = makeRng((s.seed ^ Math.imul(s.idx + 1, 0x85ebca6b) ^ Math.imul(side + 1, 0xc2b2ae35) ^ 0xdef) >>> 0)();
  return PVP_STYLES[Math.min(2, Math.floor(u * 3))];
}

export const isPvpStyle = (v: unknown): v is PvpStyle => v === 'aggro' || v === 'safe' || v === 'smart';

/**
 * Resolve o beat corrente com as duas decisões. Avança o placar pela regra do
 * Placar vivo (o beat sempre vale uma rodada; no último beat ela decide) e abre
 * o próximo beat com a Ponte — ou fecha o mapa. Partida encerrada: no-op.
 */
export function resolvePvpBeat(
  s: PvpMatchState, a: PvpStyle, b: PvpStyle, rng: Rng = beatRng(s), auto: [boolean, boolean] = [false, false],
): { state: PvpMatchState; beat: PvpBeatRecord | null } {
  if (s.status === 'done') return { state: s, beat: null };
  const beats = pvpBeats(s);
  const pA = pvpWinP(s, a, b);
  const roll = rng();
  const winner: PvpSide = roll < pA ? 0 : 1;
  const last = s.idx >= beats.length - 1;

  // mesma guarda do lockIn da Sala: fora do último beat a rodada nunca fecha o mapa.
  const next: [number, number] = winner === 0 ? [s.score[0] + 1, s.score[1]] : [s.score[0], s.score[1] + 1];
  const grew = next[winner], other = next[1 - winner];
  const overflow = grew >= WIN_ROUNDS || (grew === HALF_ROUNDS && other >= HALF_ROUNDS);
  const score: [number, number] = last || !overflow ? next : [...s.score] as [number, number];
  const momentum = clamp(s.momentum * 0.55 + (winner === 0 ? 1 : 0) * 0.45, 0, 1);

  const beat: PvpBeatRecord = { idx: s.idx, kind: beats[s.idx].kind, styles: [a, b], auto, pA, roll, winner, scoreAfter: score };
  const moved: PvpMatchState = { ...s, score, momentum, history: [...s.history, beat], idx: s.idx + 1, bridged: null };

  if (!last) return { state: openBeat(moved, winner === 0), beat };

  // último beat: decidido no placar vivo, senão joga o resto a partir dele.
  const close = mapDecided(score)
    ? { won: score[0] > score[1], score }
    : closeMapFromLive(momentum, edgeOf(s), s.seed, 0, score);
  const finalScore: [number, number] = [close.score[0], close.score[1]];
  return { state: { ...moved, status: 'done', winner: close.won ? 0 : 1, finalScore }, beat };
}

/** Encerra por W.O. (abandono): vencedor fixado sem jogar o resto. */
export function forfeitPvp(s: PvpMatchState, winner: PvpSide): PvpMatchState {
  if (s.status === 'done') return s;
  return { ...s, status: 'done', winner, finalScore: winner === 0 ? [WIN_ROUNDS, s.score[1]] : [s.score[0], WIN_ROUNDS] };
}

export interface PvpBeatView {
  idx: number;
  total: number;
  kind: BeatSpec['kind'];
  kicker: string;
  title: string;
  situation: string;
  side: 'CT' | 'T';
  score: [number, number];        // [eu, rival]
  bridged: [number, number] | null; // [eu, rival]
  options: { style: PvpStyle; label: string; desc: string; odds: Record<PvpStyle, number> }[];
}

/** Visão do beat corrente na perspectiva de `side` (textos PT-BR do engine). */
export function pvpBeatView(s: PvpMatchState, side: PvpSide): PvpBeatView | null {
  if (s.status === 'done') return null;
  const beats = pvpBeats(s);
  const spec = beats[s.idx];
  const flip = <T,>(p: [T, T]): [T, T] => (side === 0 ? p : [p[1], p[0]]);
  const score = flip(s.score);
  const ctx = ctxForBeat(spec, score, s.idx >= beats.length - 1);
  const mySide = side === 0 ? ctx.side : ctx.side === 'CT' ? 'T' : 'CT';
  const odds = pvpOddsFor(s, side);
  return {
    idx: s.idx, total: beats.length, kind: spec.kind, kicker: ctx.kicker,
    title: spec.moment.title, situation: spec.moment.situation, side: mySide, score,
    bridged: s.bridged ? flip(s.bridged) : null,
    options: PVP_STYLES.map((st) => {
      const o = spec.moment.options.find((x) => x.style === st);
      return { style: st, label: o?.label ?? PVP_STYLE_LABEL[st], desc: o?.desc ?? '', odds: odds[st] };
    }),
  };
}

/** Leitor tolerante do jsonb (versão desconhecida → null). */
export function normalizePvpMatch(v: unknown): PvpMatchState | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Partial<PvpMatchState>;
  if (o.v !== PVP_MATCH_VERSION || typeof o.seed !== 'number' || typeof o.map !== 'string' || !Array.isArray(o.score) || !Array.isArray(o.strength)) return null;
  return o as PvpMatchState;
}
