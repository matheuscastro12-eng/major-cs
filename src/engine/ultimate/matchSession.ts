// [U06] SESSÃO DE PARTIDA INCREMENTAL do Ultimate — casual primeiro.
//
// Antes: simulateSeries rodava a série inteira e o resultado era gravado ANTES
// do replay; um botão de timeout no replay seria placebo. Agora a partida casual
// é um ESTADO PERSISTÍVEL (seed, times travados, cursor de round, decisões) e o
// motor avança um round por vez com createMapSim.step(). Como o RNG (mulberry32)
// não é retomável por tick, a retomada REEXECUTA do zero até o cursor — barato
// (≤ 30 rounds) e determinístico: mesma seed + mesmas decisões ⇒ mesmos rounds.
//
// Timeout REAL: uma decisão {round, team} entra como boostTeam (+2.0 de força,
// match.ts) nos TIMEOUT_ROUNDS rounds seguintes. Só pode ser chamado ENTRE
// rounds, para o round atual em diante — os rounds já resolvidos ficam iguais
// (mesmos sorteios, mesmas entradas). Máximo 1 por lado por mapa.
//
// Término idempotente: `finishSession` só monta o resultado; quem grava a
// recompensa usa `matchId` num ledger local (a UI) — F5, retry e reabrir nunca
// pagam duas vezes. Recarregar não re-rola a seed nem apaga decisões.
import type { MapId, MapResult, SeriesResult, TTeam } from '../../types';
import { makeRng } from '../rng';
import { createMapSim } from '../match';

export const SESSION_VERSION = 1 as const;
export const TIMEOUT_ROUNDS = 3;          // rounds afetados por um timeout (igual à Carreira)
export const TIMEOUTS_PER_SIDE = 1;       // por mapa

export interface TimeoutDecision { round: number; team: 0 | 1 }   // round = índice do 1º round afetado (0-based)

export interface MatchSession {
  v: typeof SESSION_VERSION;
  matchId: string;                 // idempotência da recompensa
  mode: 'casual';
  seed: number;                    // seed única da partida (veto + rounds)
  teams: [TTeam, TTeam];           // travados na criação (já com multiplicadores/abordagem)
  map: MapId;
  pickedBy: 0 | 1 | -1;
  cursor: number;                  // rounds já resolvidos/exibidos
  decisions: TimeoutDecision[];
  status: 'live' | 'done';
  createdAt: number;
}

export interface SessionView {
  score: [number, number];
  round: number;                   // = rounds resolvidos
  done: boolean;
  roundLog: (0 | 1)[];
  killFeed: MapResult['killFeed'];
  timeoutsLeft: [number, number];
  nextWinProb: number | null;      // P(time 0 vencer o próximo round) sem boost — leitura pré-round
  result: MapResult | null;        // só quando done
}

// Sorteia o mapa com o mesmo autoVeto que o playMatch usava — mas aqui recebido
// pronto pelo chamador (a UI já tem autoVeto); a sessão guarda map/pickedBy.
export function createSession(input: { matchId: string; seed: number; teams: [TTeam, TTeam]; map: MapId; pickedBy: 0 | 1 | -1; now: number }): MatchSession {
  return { v: SESSION_VERSION, matchId: input.matchId, mode: 'casual', seed: input.seed >>> 0, teams: input.teams, map: input.map, pickedBy: input.pickedBy, cursor: 0, decisions: [], status: 'live', createdAt: input.now };
}

function boostFor(decisions: TimeoutDecision[], round: number): 0 | 1 | null {
  // se os dois lados cobrem o mesmo round, ambos recebem (+2 cada) — simétrico,
  // sem vantagem por ordem de chamada. Representamos como null (anulam) para o
  // step, que só aceita um boostTeam: a soma é zero na diferença de força.
  const a = decisions.some((d) => d.team === 0 && round >= d.round && round < d.round + TIMEOUT_ROUNDS);
  const b = decisions.some((d) => d.team === 1 && round >= d.round && round < d.round + TIMEOUT_ROUNDS);
  if (a && b) return null;
  return a ? 0 : b ? 1 : null;
}

// Reexecuta do zero até `upto` rounds (ou até o fim se upto ≥ total).
function replay(s: MatchSession, upto: number) {
  const rng = makeRng(s.seed);
  const sim = createMapSim(rng, s.teams[0], s.teams[1], s.map, s.pickedBy);
  let r = 0;
  while (!sim.done() && r < upto) { sim.step(boostFor(s.decisions, r)); r++; }
  return sim;
}

export function viewSession(s: MatchSession): SessionView {
  const sim = replay(s, s.cursor);
  const used: [number, number] = [s.decisions.filter((d) => d.team === 0).length, s.decisions.filter((d) => d.team === 1).length];
  const done = sim.done();
  return {
    score: sim.score(), round: sim.round(), done,
    roundLog: [...sim.roundLog()], killFeed: [...sim.killFeed()],
    timeoutsLeft: [TIMEOUTS_PER_SIDE - used[0], TIMEOUTS_PER_SIDE - used[1]],
    nextWinProb: done ? null : sim.peekWinProb(0),
    result: done ? sim.result() : null,
  };
}

/** Avança UM round. Idempotente quando já terminou. */
export function advanceSession(s: MatchSession): MatchSession {
  if (s.status === 'done') return s;
  const sim = replay(s, s.cursor + 1);
  const done = sim.done();
  return { ...s, cursor: sim.round(), status: done ? 'done' : 'live' };
}

/** Pede timeout para `team` a partir do PRÓXIMO round (entre rounds). Regras:
 *  partida viva, ainda tem timeout, e não há decisão do mesmo lado em vigor. */
export function callTimeout(s: MatchSession, team: 0 | 1): { ok: boolean; session: MatchSession; reason?: 'done' | 'none_left' | 'active' } {
  if (s.status === 'done') return { ok: false, session: s, reason: 'done' };
  const used = s.decisions.filter((d) => d.team === team).length;
  if (used >= TIMEOUTS_PER_SIDE) return { ok: false, session: s, reason: 'none_left' };
  if (s.decisions.some((d) => d.team === team && s.cursor < d.round + TIMEOUT_ROUNDS)) return { ok: false, session: s, reason: 'active' };
  return { ok: true, session: { ...s, decisions: [...s.decisions, { round: s.cursor, team }] } };
}

/** IA: regra determinística e explícita — chama timeout uma vez quando está
 *  perdendo 3+ rounds seguidos depois do 4º round (ou atrás por 4+ no placar). */
export function aiWantsTimeout(s: MatchSession, view: SessionView): boolean {
  if (s.status === 'done' || view.timeoutsLeft[1] <= 0) return false;
  const log = view.roundLog;
  if (log.length < 4) return false;
  let streak = 0;
  for (let i = log.length - 1; i >= 0 && log[i] === 0; i--) streak++;
  const behind = view.score[1] <= view.score[0] - 4;
  return streak >= 3 || behind;
}

/** Corre até o fim (skip) — mesmas decisões, mesmos rounds. */
export function skipToEnd(s: MatchSession): MatchSession {
  if (s.status === 'done') return s;
  const sim = replay(s, 99);
  return { ...s, cursor: sim.round(), status: 'done' };
}

/** Série (MD1) no formato que o resto do jogo consome (mvp, evidência, drama). */
export function sessionSeries(s: MatchSession): SeriesResult | null {
  if (s.status !== 'done') return null;
  const m = replay(s, 99).result();
  return { teamIds: [s.teams[0].id, s.teams[1].id], maps: [m], winner: m.winner, mapScore: m.winner === 0 ? [1, 0] : [0, 1] };
}

/** Leitor tolerante do JSON persistido (sessão de outra versão → null). */
export function normalizeSession(v: unknown): MatchSession | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Partial<MatchSession>;
  if (o.v !== SESSION_VERSION || typeof o.matchId !== 'string' || typeof o.seed !== 'number' || !Array.isArray(o.teams) || o.teams.length !== 2 || typeof o.map !== 'string') return null;
  const decisions = Array.isArray(o.decisions) ? o.decisions.filter((d): d is TimeoutDecision => !!d && typeof d.round === 'number' && (d.team === 0 || d.team === 1)) : [];
  return { v: SESSION_VERSION, matchId: o.matchId, mode: 'casual', seed: o.seed >>> 0, teams: o.teams as [TTeam, TTeam], map: o.map as MapId, pickedBy: (o.pickedBy === 0 || o.pickedBy === 1 || o.pickedBy === -1) ? o.pickedBy : -1, cursor: Math.max(0, Math.floor(Number(o.cursor) || 0)), decisions, status: o.status === 'done' ? 'done' : 'live', createdAt: Number(o.createdAt) || 0 };
}
