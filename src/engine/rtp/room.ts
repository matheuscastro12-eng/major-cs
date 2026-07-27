// SALA — a partida jogada beat-a-beat. Máquina de estados PURA da série.
//
// Este módulo é a ÚNICA VERDADE do placar de uma série jogada: odds, momentum,
// clutch multi-step, rolls pré-comprometidos, leitura tática, skip e o
// fechamento de mapa/série vivem AQUI. A UI (RtpRoundRoom) é um adaptador de
// render: guarda um RoomState, chama as transições e anima por cima; circuit/
// major/testes consomem o MESMO seam. Histórico: a regra vivia inline no
// componente e a verdade do placar tinha 5 cópias sincronizadas na mão — três
// bugs de "placar contradiz a Sala" nasceram disso (56b4d86, 423c93c, 1f6fe92).
//
// Fronteira (decisão de design): o engine só modela o LÓGICO — fases de
// decisão e o dado completo de cada resolução. Ritmo de apresentação (needle
// rolando, stinger, ponte visual) é sub-estado da UI por cima do RoomState.
// Inputs vivos (escolha, perf do minigame) entram como argumentos; o engine
// nunca lê relógio, matchMedia nem random não-semeado.
//
// PARIDADE: seeds e fórmulas são idênticos aos que o componente usava — o
// mesmo save/prep + as mesmas escolhas produzem exatamente a mesma série.

import { makeRng } from '../rng';
import type { MapId, Role } from '../../types';
import type { AttrKey } from '../attributes';
import {
  resolveMoment, explainOdds, clutchStepMoment,
  type Moment, type MomentOption, type MomentOutcome, type OddsBreakdown,
} from './moments';
import {
  buildBeatPlan, ctxForBeat, initialLiveScore, bridgeToBeat, mergeMapClose,
  resolveMapFromPlay, mapPlayOf,
  type BeatSpec, type LiveScore, type Interlude, type RoundCtx,
} from './roundModel';
import { MINIGAMES, type MiniGameDef } from './minigames';
import { planStyleBias, gamePlanDef, type GamePlan } from './meta';
import {
  buildUserTeam, simulateSeriesForPlay, assembleProResult, execBoostOvr,
  type MatchPrep, type ProMatchResult,
} from './matchSim';
import { summarizeMoments } from './moments';
import { resolveRoomSeries } from './roundModel';
import type { TTeam, SeriesResult } from '../../types';
import type { RoadToProSave } from './types';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// perf → pontos de atributo EFETIVO. 0.55 = neutro (o "instinto"); execução
// perfeita ≈ +2.7 attr (~+8% de chance), o piso do scoreToPerf ≈ −0.9 (~−3%).
export const EXEC_NEUTRAL = 0.55;
export const execBoostOf = (perf: number) => (perf - EXEC_NEUTRAL) * 6;

// ─────────────────────────────────────────────────────────────────────────────
// Tipos

export interface ClosedMap { map: MapId; score: [number, number]; won: boolean }

export interface ClutchState {
  alive: number; step: number; hot: number; bombSecs: number | null; subs: MomentOutcome[];
}

// Config imutável da série (derivada de save+prep no createRoom).
export interface RoomConfig {
  role: Role;
  heroOvr: number;
  matchSeed: number;
  oppStrength: number;
  mapsIds: MapId[];
  bestOf: 1 | 3 | 5;
  effAttrs: Record<AttrKey, number>;
  factors: { label: string; delta: number; good: boolean }[];
  plan?: GamePlan;
  grudge?: number;
  confidence?: number;
}

// O dado COMPLETO de uma resolução (o que a UI anima: needle, stinger, feed).
export interface ResolvedBeat {
  opt: MomentOption;
  odds: OddsBreakdown;          // odds finais (com execução) — threshold do roll
  baseTotal: number;            // odds ANTES da execução (needle anima base→final)
  roll: number;
  outcome: MomentOutcome;
  clutchFinal: boolean;         // clutch: este passo fechou (ou perdeu) o 1vX
  newAlive: number;             // clutch: inimigos vivos após o passo
  execPerf: number | null;      // performance no minigame (null = beat sem execução)
  scored: boolean;              // este passo pontuou a rodada no placar vivo
  youWonRound: boolean;         // (quando scored) a rodada foi sua
}

export type RoomPhase = 'decide' | 'resolved' | 'done';

// O resultado final — o que o onComplete entrega hoje (outcomes + liveMaps).
// liveMaps ausente = série pulada (skip): o fechamento natural fica pro
// resolveRoomSeries no finish (mesma régua, sem placar vivo pra fundir).
export interface RoomFinal {
  outcomes: MomentOutcome[];
  liveMaps?: ClosedMap[];
}

export interface RoomState {
  cfg: RoomConfig;
  beats: BeatSpec[];
  idx: number;
  phase: RoomPhase;
  live: LiveScore;
  closedMaps: ClosedMap[];      // mapas COMO A SALA FECHOU/EXIBIU (v17)
  outcomes: MomentOutcome[];    // beats finalizados (clutch agrega os passos)
  momentum: number;             // 0..1
  reads: number;                // leituras táticas restantes
  readUsed: boolean;            // leitura ativa NA decisão atual
  clutch: ClutchState | null;   // sub-estado do clutch multi-step
  pending: ResolvedBeat | null; // resolução aguardando advance() (fase 'resolved')
  interlude: Interlude | null;  // ponte narrativa pro beat atual (display)
  final: RoomFinal | null;      // preenchido quando phase === 'done'
}

// ─────────────────────────────────────────────────────────────────────────────
// Criação

export function createRoom(save: RoadToProSave, prep: MatchPrep): RoomState {
  const cfg: RoomConfig = {
    role: save.player.role,
    heroOvr: save.player.ovr,
    matchSeed: prep.matchSeed,
    oppStrength: prep.opp.strength,
    mapsIds: prep.maps.map((m) => m.map),
    bestOf: prep.bestOf,
    effAttrs: prep.effAttrs,
    factors: prep.factors,
    plan: prep.plan,
    grudge: prep.grudge,
    confidence: prep.confidence,
  };
  const beats = buildBeatPlan(cfg.role, cfg.mapsIds, cfg.matchSeed);
  return {
    cfg,
    beats,
    idx: 0,
    phase: 'decide',
    live: initialLiveScore(),
    closedMaps: [],
    outcomes: [],
    // momentum inicial SEMEADO pela confiança (moral + sequência).
    momentum: clamp(0.5 + (cfg.confidence ?? 0) * 0.14, 0.32, 0.68),
    // leituras táticas: recurso limitado que escala com game sense.
    reads: clamp(1 + Math.round((cfg.effAttrs.gameSense ?? 10) / 7), 1, 4),
    readUsed: false,
    clutch: beats[0]?.kind === 'clutch' ? initClutch(beats[0]) : null,
    pending: null,
    interlude: null,
    final: null,
  };
}

function initClutch(b: BeatSpec): ClutchState {
  return { alive: Math.max(1, b.alive[1]), step: 0, hot: 0, bombSecs: b.bomb?.defuseSecs ?? null, subs: [] };
}

// ─────────────────────────────────────────────────────────────────────────────
// Derivações (puras — a UI lê daqui, nada é recalculado no componente)

export function currentBeat(s: RoomState): BeatSpec { return s.beats[s.idx]; }
export function isLastBeat(s: RoomState): boolean { return s.idx >= s.beats.length - 1; }
export function inClutchOf(s: RoomState): boolean { return currentBeat(s).kind === 'clutch' && !!s.clutch; }

// momento/contexto correntes: no clutch, é a etapa atual (1vX) com a bomba/vivos.
export function currentMoment(s: RoomState): Moment {
  return inClutchOf(s) ? clutchStepMoment(s.clutch!.alive, s.clutch!.bombSecs) : currentBeat(s).moment;
}
export function currentCtx(s: RoomState): RoundCtx {
  const ctx = ctxForBeat(currentBeat(s), s.live.mapScore, isLastBeat(s));
  if (!inClutchOf(s)) return ctx;
  return {
    ...ctx,
    alive: [1, s.clutch!.alive],
    bomb: ctx.bomb ? { ...ctx.bomb, defuseSecs: s.clutch!.bombSecs ?? ctx.bomb.defuseSecs } : null,
  };
}

// rounds de PRESSÃO (clutch/map point): a confiança firma ou treme aqui.
export function pressureOf(s: RoomState): boolean {
  const k = currentBeat(s).kind;
  return k === 'clutch' || k === 'mapPoint' || inClutchOf(s);
}

// MOMENTO-CHAVE atual: beat com spotlight — no clutch, só o DUELO FINAL (1v1)
// é executado na sua mão; os passos anteriores mantêm o ritmo do dado.
export function spotlightOf(s: RoomState): MiniGameDef | null {
  const b = currentBeat(s);
  return b.spotlight && (!inClutchOf(s) || s.clutch!.alive === 1) ? MINIGAMES[b.spotlight] : null;
}

// seed do minigame de execução do beat/passo corrente.
export function execSeedOf(s: RoomState): number {
  return (s.cfg.matchSeed ^ ((s.idx + 1) * 0x51ed) ^ ((s.clutch?.step ?? 0) * 0xe1) ^ 0x9a3e) >>> 0;
}

// win-prob derivada do PLACAR REAL (mapa + série) + momentum + força.
export function winProbOf(s: RoomState): number {
  const edge = (s.live.mapScore[0] - s.live.mapScore[1]) * 2.2
    + (s.live.seriesScore[0] - s.live.seriesScore[1]) * 14
    + (s.momentum - 0.5) * 30 + (s.cfg.heroOvr - s.cfg.oppStrength) * 0.8;
  return clamp(50 + edge, 5, 95);
}

// mesma banda do resolveMoment: [thr, thr+banda) = PARCIAL (meio-termo com
// frag). Exportada pra needle da UI e testes lerem da MESMA fonte.
export const partialBandOf = (threshold: number) => Math.min(0.18, (1 - threshold) * 0.7);

// rating ao vivo estimado (ticker). includePending: a UI só conta o beat
// corrente quando o resultado já está NA TELA (não durante a animação do roll).
export function liveRatingOf(s: RoomState, includePending = true): number {
  const all = [...s.outcomes, ...(includePending && s.pending && s.phase === 'resolved' ? [s.pending.outcome] : [])];
  if (!all.length) return 1.0;
  const avg = all.reduce((a, o) => a + o.value, 0) / all.length;
  return Math.round((0.55 + avg * 1.05) * 100) / 100;
}

// ─────────────────────────────────────────────────────────────────────────────
// Odds / atributo efetivo — a fórmula que o roll USA (nada cosmético)

const momMultOf = (s: RoomState) => 1 + (s.momentum - 0.5) * 0.16;   // ±8%
const planBiasOf = (s: RoomState, opt: MomentOption) => (s.cfg.plan ? planStyleBias(s.cfg.plan, opt.style) : 0);
const confBoostOf = (s: RoomState) => (pressureOf(s) ? (s.cfg.confidence ?? 0) * 2 : 0);

// atributo efetivo: condição off-game (effAttrs) + hot-hand do clutch + leitura
// tática + plano de jogo + rivalidade + confiança, tudo aquecido pelo momentum.
export function effFor(s: RoomState, opt: MomentOption): number {
  return clamp(
    (s.cfg.effAttrs[opt.attr]
      + (inClutchOf(s) ? s.clutch!.hot : 0)
      + (s.readUsed ? 2 : 0)
      + planBiasOf(s, opt)
      + (s.cfg.grudge ?? 0)
      + confBoostOf(s)) * momMultOf(s),
    1, 20,
  );
}
// atributo efetivo COM a execução do minigame (perf move o attr de verdade).
export function effWith(s: RoomState, opt: MomentOption, execPerf: number | null): number {
  return clamp(effFor(s, opt) + (execPerf != null ? execBoostOf(execPerf) : 0), 1, 20);
}

// odds por opção, espelhando EXATAMENTE a fórmula do resolveMoment.
export function roomOdds(s: RoomState, opt: MomentOption, execPerf: number | null = null): OddsBreakdown {
  const factors = [...s.cfg.factors];
  const mPct = Math.round((momMultOf(s) - 1) * 100);
  if (mPct !== 0) factors.push({ label: s.momentum >= 0.5 ? 'Embalado' : 'Pressionado', delta: mPct, good: mPct > 0 });
  if (inClutchOf(s) && s.clutch!.hot > 0) factors.push({ label: 'Embalo do clutch', delta: Math.round(s.clutch!.hot * 5), good: true });
  if (s.readUsed) factors.push({ label: 'Leitura tática', delta: 8, good: true });
  const pb = planBiasOf(s, opt);
  if (s.cfg.plan && pb !== 0) factors.push({ label: gamePlanDef(s.cfg.plan).label, delta: pb * 4, good: pb > 0 });
  const cb = confBoostOf(s);
  if (pressureOf(s) && cb !== 0) factors.push({ label: cb > 0 ? 'Confiança' : 'Pressão', delta: Math.round(cb * 5), good: cb > 0 });
  if (execPerf != null) {
    const d = Math.round(execBoostOf(execPerf) * 3.1);   // ≈ % por ponto de attr
    if (d !== 0) factors.push({ label: 'Execução', delta: d, good: d > 0 });
  }
  return explainOdds(opt, effWith(s, opt, execPerf), s.cfg.oppStrength, factors);
}

// ─────────────────────────────────────────────────────────────────────────────
// Transições

// Leitura tática: revela a tendência e soma +2 no atributo da decisão atual.
export function useRead(s: RoomState): RoomState {
  if (s.reads <= 0 || s.readUsed || s.phase !== 'decide') return s;
  return { ...s, reads: s.reads - 1, readUsed: true };
}

// LOCK IN + resolução: roll pré-comprometido (seed fixo por beat/passo) +
// threshold movido pela execução — o dado já estava lançado antes da animação.
// Aplica o placar vivo e o momentum do passo (a parte que muda o JOGO); a UI
// anima needle/stinger por cima e chama advance() quando o jogador seguir.
export function lockIn(s: RoomState, optId: string, execPerf: number | null = null): { state: RoomState; beat: ResolvedBeat } {
  if (s.phase !== 'decide') return { state: s, beat: s.pending! };
  const moment = currentMoment(s);
  const opt = moment.options.find((o) => o.id === optId) ?? moment.options[0];
  const inClutch = inClutchOf(s);

  const seed = (s.cfg.matchSeed ^ ((s.idx + 1) * 0x9e3779b1) ^ ((s.clutch?.step ?? 0) * 0x85ebca6b)) >>> 0;
  const roll = makeRng(seed)();                       // mesmo 1º valor que o resolveMoment usa
  // execPerf viaja NO outcome: summarizeMoments agrega e o finish converte em
  // boost real de rating (jogou bem os minigames → rating bom; mal → ruim).
  const outcome: MomentOutcome = {
    ...resolveMoment(moment, opt, effWith(s, opt, execPerf), s.cfg.oppStrength, makeRng(seed)),
    ...(execPerf != null ? { execPerf } : {}),
  };

  let clutchFinal = true, newAlive = 0;
  if (inClutch) {
    const died = outcome.result === 'fail';
    newAlive = s.clutch!.alive - (died ? 0 : 1);
    clutchFinal = died || newAlive <= 0;
  }

  // só pontua a rodada num beat normal OU no FECHAMENTO do clutch.
  const scored = !inClutch || clutchFinal;
  const youWonRound = inClutch
    ? outcome.result !== 'fail' && newAlive <= 0
    : outcome.result === 'success' || outcome.result === 'partial';

  let live = s.live;
  let momentum = s.momentum;
  if (scored) {
    // v17 (bug do 15-8): o +1 do beat respeita o MESMO teto da ponte — um lado
    // só chega a 12 (match point) se o outro estiver ≤11; 13 é exclusivo do
    // FECHAMENTO do mapa.
    const [you, them] = live.mapScore;
    const next: [number, number] = youWonRound ? [you + 1, them] : [you, them + 1];
    const grew = youWonRound ? next[0] : next[1];
    const other = youWonRound ? next[1] : next[0];
    if (!(grew > 12 || (grew === 12 && other >= 12))) live = { ...live, mapScore: next };
    momentum = clamp(momentum * 0.55 + outcome.value * 0.45, 0, 1);
  }

  const beat: ResolvedBeat = {
    opt,
    odds: roomOdds(s, opt, execPerf),
    baseTotal: roomOdds(s, opt).total,
    roll, outcome, clutchFinal, newAlive, execPerf, scored, youWonRound,
  };
  return { state: { ...s, phase: 'resolved', pending: beat, live, momentum }, beat };
}

// AVANÇA após a resolução: continua o clutch, ou finaliza o beat (fecha mapa /
// série quando for o caso) e abre o próximo com a ponte narrativa.
export function advance(s: RoomState): RoomState {
  const locked = s.pending;
  if (s.phase !== 'resolved' || !locked) return s;
  const inClutch = inClutchOf(s);
  const beat = currentBeat(s);

  // CONTINUA o clutch: mais inimigos vivos e você sobreviveu.
  if (inClutch && !locked.clutchFinal) {
    const c = s.clutch!;
    return {
      ...s,
      phase: 'decide',
      pending: null,
      readUsed: false,
      interlude: null,
      clutch: {
        alive: locked.newAlive,
        step: c.step + 1,
        hot: c.hot + 1.6,
        bombSecs: c.bombSecs != null ? Math.max(0, c.bombSecs - 7) : null,
        subs: [...c.subs, locked.outcome],
      },
    };
  }

  // FINALIZA o beat (normal, ou clutch fechado/perdido): clutch agrega os passos.
  let beatOutcome = locked.outcome;
  if (inClutch && s.clutch) {
    const subs = [...s.clutch.subs, locked.outcome];
    const cleared = locked.outcome.result !== 'fail' && locked.newAlive <= 0;
    beatOutcome = {
      result: cleared ? 'success' : 'fail',
      value: subs.reduce((a, o) => a + o.value, 0) / subs.length,
      frags: subs.reduce((a, o) => a + o.frags, 0),
      deaths: cleared ? 0 : 1,
      openings: 0,
      clutches: cleared ? 1 : 0,
      narrative: cleared ? 'CLUTCH FECHADO! Você limpou o 1vX sozinho.' : 'O clutch escapou no último duelo.',
    };
  }
  const acc = [...s.outcomes, beatOutcome];

  // A JOGADA decide o mapa: fecho cada mapa pela SUA média de beats NELE, com a
  // MESMA régua/seed do card (resolveMapFromPlay) → o placar vivo == resultado.
  const edge = s.cfg.heroOvr - s.cfg.oppStrength;
  const need = Math.ceil(s.cfg.bestOf / 2);
  const mapsIds = s.cfg.mapsIds;
  const allPlay = acc.length ? acc.reduce((a, o) => a + o.value, 0) / acc.length : 0.5;
  // v17: fechamento FUNDIDO com o placar vivo (nunca encolhe o que o jogador
  // viu; vencedor segue 100% da jogada).
  const closeMap = (mi: number, play: number, liveMap: [number, number] = [0, 0]) =>
    mergeMapClose(resolveMapFromPlay(play, edge, s.cfg.matchSeed, mi), liveMap);
  const mapIdAt = (mi: number): MapId => mapsIds[Math.min(mi, Math.max(0, mapsIds.length - 1))] ?? 'mirage';

  if (isLastBeat(s)) {
    // fecha o mapa corrente + mapas virtuais do BO5 (sem beats no plano) pela
    // jogada AGREGADA — idêntico ao fallback do resolveRoomSeries.
    const closed = [...s.closedMaps];
    let sy = s.live.seriesScore[0], st = s.live.seriesScore[1];
    const cm = closeMap(beat.mapIndex, mapPlayOf(acc, s.beats, beat.mapIndex, allPlay), s.live.mapScore);
    closed.push({ map: mapIdAt(beat.mapIndex), score: cm.score, won: cm.won });
    if (cm.won) sy++; else st++;
    let mi = beat.mapIndex + 1;
    while (sy < need && st < need) {
      const r = closeMap(mi, allPlay);
      closed.push({ map: mapIdAt(mi), score: r.score, won: r.won });
      if (r.won) sy++; else st++; mi++;
    }
    return {
      ...s,
      phase: 'done',
      pending: null,
      outcomes: acc,
      closedMaps: closed,
      live: { mapScore: cm.score, seriesScore: [sy, st], mapIndex: beat.mapIndex },
      final: { outcomes: acc, liveMaps: closed },
    };
  }

  const nb = s.beats[s.idx + 1];

  // TRANSIÇÃO DE MAPA: fecha o mapa que acabou pela sua jogada nele.
  if (nb.mapIndex > beat.mapIndex) {
    const { won, score } = closeMap(beat.mapIndex, mapPlayOf(acc, s.beats, beat.mapIndex, allPlay), s.live.mapScore);
    const newSeries: [number, number] = won
      ? [s.live.seriesScore[0] + 1, s.live.seriesScore[1]]
      : [s.live.seriesScore[0], s.live.seriesScore[1] + 1];
    const closeLine = won
      ? `Vocês fecharam o mapa ${score[0]}–${score[1]} — série ${newSeries[0]}–${newSeries[1]}.`
      : `Eles levaram o mapa ${score[1]}–${score[0]} — série ${newSeries[0]}–${newSeries[1]}.`;
    const closed = [...s.closedMaps, { map: mapIdAt(beat.mapIndex), score, won }];

    if (newSeries[0] >= need || newSeries[1] >= need) {
      // série decidida (ex.: 2-0): NÃO joga os beats restantes — varreu.
      return {
        ...s,
        phase: 'done',
        pending: null,
        outcomes: acc,
        closedMaps: closed,
        live: { mapScore: score, seriesScore: newSeries, mapIndex: beat.mapIndex },
        interlude: { bridged: [0, 0], lines: [closeLine], mapClosed: { map: beat.map, won, score } },
        final: { outcomes: acc, liveMaps: closed },
      };
    }

    // série segue: abre o próximo mapa (bridge só a ABERTURA, sem novo fechamento).
    const openLive: LiveScore = { mapScore: [0, 0], seriesScore: newSeries, mapIndex: nb.mapIndex };
    const nbLastOfMap = s.idx + 2 >= s.beats.length || s.beats[s.idx + 2].mapIndex !== nb.mapIndex;
    const bridge = bridgeToBeat(openLive, nb, null, s.momentum, edge, s.cfg.matchSeed, mapsIds, nbLastOfMap);
    return {
      ...s,
      phase: 'decide',
      pending: null,
      outcomes: acc,
      closedMaps: closed,
      live: bridge.live,
      interlude: {
        bridged: bridge.interlude?.bridged ?? [0, 0],
        lines: [closeLine, ...(bridge.interlude?.lines ?? [])],
        mapClosed: { map: beat.map, won, score },
      },
      clutch: nb.kind === 'clutch' ? initClutch(nb) : null,
      readUsed: false,
      idx: s.idx + 1,
    };
  }

  // MESMO MAPA: os rounds entre este beat e o próximo acontecem (bridge intra-mapa).
  const youWon = inClutch
    ? beatOutcome.result === 'success'
    : locked.outcome.result === 'success' || locked.outcome.result === 'partial';
  const bridge = bridgeToBeat(s.live, nb, youWon, s.momentum, edge, s.cfg.matchSeed, mapsIds, false);
  return {
    ...s,
    phase: 'decide',
    pending: null,
    outcomes: acc,
    live: bridge.live,
    interlude: bridge.interlude,
    clutch: nb.kind === 'clutch' ? initClutch(nb) : null,
    readUsed: false,
    idx: s.idx + 1,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// FINALIZAÇÃO — o resultado oficial sai DAQUI (circuit e major consomem este
// seam; antes cada um repetia o trio resolveRoomSeries + override de liveMaps +
// simulateSeriesForPlay, e o placar era uma negociação a três).

// Resolve o resultado oficial da série a partir do RoomFinal: o placar exibido
// vem dos mapas COMO A SALA FECHOU (jogada) ou do placar natural
// (resolveRoomSeries — skip/sim, mesma régua por construção). O sim de time
// entra como detalhe interno, só pra gerar scoreboard/stats coerentes com esse
// placar. `oppStored` é o time adversário como está no bracket (normalizado aqui).
export function finishSeries(
  save: RoadToProSave, prep: MatchPrep, final: RoomFinal, oppStored: TTeam,
): { result: ProMatchResult; series: SeriesResult } {
  const summary = summarizeMoments(final.outcomes);
  // Decisões (±9) + EXECUÇÃO nos minigames (±4.5/−1.5) movem o herói no sim de
  // verdade — jogou bem os momentos-chave, o rating sobe; jogou mal, cai.
  const momentBoost = (summary.score - 0.5) * 18 + execBoostOvr(summary.execAvg);
  const userTeam = buildUserTeam(save, prep.effAttrs, momentBoost, 'user');
  const oppTeam: TTeam = { ...oppStored, wins: 0, losses: 0, roundDiff: 0, status: 'alive', noEdge: true };
  const maps = final.liveMaps && final.liveMaps.length
    ? final.liveMaps
    : resolveRoomSeries(save.player.role, final.outcomes, save.player.ovr - prep.opp.strength,
        prep.matchSeed, prep.maps.map((m) => m.map), prep.bestOf).maps;
  const mapWins: [number, number] = [maps.filter((m) => m.won).length, maps.filter((m) => !m.won).length];
  const seriesWon = mapWins[0] > mapWins[1];
  const series = simulateSeriesForPlay((prep.matchSeed ^ 0x1234567) >>> 0, userTeam, oppTeam, prep.maps, prep.bestOf, { mapWins, seriesWon });
  const result = assembleProResult(userTeam, oppTeam, series, summary.score, summary.execAvg, maps);
  return { result, series };
}

// PULAR: resolve os beats restantes (a partir do atual) no automático e fecha a
// série — preserva os já jogados. Sem liveMaps: o fechamento natural fica pro
// finish (resolveRoomSeries), exatamente como o caminho antigo.
export function skipRest(s: RoomState): RoomState {
  if (s.phase === 'done') return s;
  const acc = [...s.outcomes];
  for (let i = s.idx; i < s.beats.length; i++) {
    const b = s.beats[i];
    const opt = b.moment.options.find((o) => o.style === 'smart') ?? b.moment.options[0];
    const seed = (s.cfg.matchSeed ^ ((i + 1) * 0x9e3779b1)) >>> 0;
    const eff = clamp(s.cfg.effAttrs[opt.attr] + planBiasOf(s, opt) + (s.cfg.grudge ?? 0), 1, 20);
    acc.push(resolveMoment(b.moment, opt, eff, s.cfg.oppStrength, makeRng(seed)));
  }
  return { ...s, phase: 'done', pending: null, outcomes: acc, final: { outcomes: acc } };
}
