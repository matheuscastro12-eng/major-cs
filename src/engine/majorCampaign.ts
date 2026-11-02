import { logoForName } from '../data/media';
// MODO MAJOR JOGADO — o usuário escolhe um time do PGL Major Singapore 2026 e
// joga as séries DELE na Sala (a mesma máquina de estados do Road to Pro,
// engine/rtp/room.ts); as outras séries seguem simuladas pelo rating.
//
// Como funciona: a campanha é só { seed, time, função, séries jogadas }. O
// Major inteiro é REJOGADO do zero a cada consulta (simulateMajor com um
// SeriesPlayer próprio): as séries de IA consomem o MESMO rng de sempre e as
// do usuário não consomem nada, então o replay é idêntico. Quando o replay
// chega numa série do usuário ainda não jogada, para e devolve essa série como
// a próxima. Nada de estado paralelo pra sincronizar.
//
// A Sala precisa de um save + prep (MatchPrep). Usamos o mesmo fixture da Série
// do Dia (createRtpSave + prepareCircuitMatch) e trocamos só o que é do Major:
// adversário, força relativa, MD e mapas. O placar e o rating do herói saem do
// finishCircuitMatch, a mesma régua do circuito. TS puro, determinístico.

import { makeRng } from './rng';
import {
  simulateMajor, simSeries,
  type MajorData, type MajorMatch, type MajorResult, type MajorTeam, type SeriesPlayer,
} from './majorSingapore';
import { createRtpSave } from './rtp/createSave';
import { prepareCircuitMatch, finishCircuitMatch } from './rtp/circuit';
import { pickMaps, type MatchPrep } from './rtp/matchSim';
import type { MomentOutcome } from './rtp/moments';
import type { RoadToProSave } from './rtp/types';
import type { MapId, Role } from '../types';

export type MajorPhase = 1 | 2 | 3 | 4; // 4 = playoffs

export interface PlayedSeries {
  phase: MajorPhase;
  label: string;          // R1..R5 / QF1.. / SF1.. / F
  a: string;
  b: string;
  winner: string;
  score: [number, number]; // mapas [a, b]
  heroRating: number;      // rating do seu jogador na série (2 casas)
}

export interface MajorCampaign {
  v: 1;
  seed: number;
  teamId: string;
  role: Role;
  nick: string;
  played: PlayedSeries[];
}

/** a série do usuário que a campanha está esperando */
export interface PendingSeries {
  phase: MajorPhase;
  label: string;
  a: string;
  b: string;
  bestOf: 1 | 3 | 5;
  /** o adversário */
  opp: string;
}

export interface CampaignView {
  /** Major completo (null enquanto há série do usuário pendente) */
  result: MajorResult | null;
  next: PendingSeries | null;
  /** o time do usuário caiu (o resto do Major já está simulado em result) */
  eliminated: boolean;
}

class Pending {
  match: PendingSeries;
  constructor(match: PendingSeries) { this.match = match; }
}

export function newCampaign(seed: number, teamId: string, role: Role, nick = 'você'): MajorCampaign {
  return { v: 1, seed: seed >>> 0, teamId, role, nick, played: [] };
}

/** joga o Major até a próxima série do usuário (ou até o fim) */
export function campaignView(d: MajorData, c: MajorCampaign): CampaignView {
  let k = 0;
  const play: SeriesPlayer = (a, b, bestOf, label, rng, phase) => {
    if (a.id !== c.teamId && b.id !== c.teamId) return simSeries(a, b, bestOf, label, rng, phase);
    const rec = c.played[k];
    if (!rec || rec.phase !== phase || rec.label !== label || rec.a !== a.id || rec.b !== b.id) {
      throw new Pending({ phase, label, a: a.id, b: b.id, bestOf, opp: a.id === c.teamId ? b.id : a.id });
    }
    k++;
    return { a: a.id, b: b.id, bestOf, winner: rec.winner, score: rec.score, label };
  };
  try {
    const result = simulateMajor(d, c.seed, play);
    return { result, next: null, eliminated: result.playoffs.champion !== c.teamId };
  } catch (e) {
    if (e instanceof Pending) return { result: null, next: e.match, eliminated: false };
    throw e;
  }
}

// ---------------------------------------------------------------- a Sala

/** seed da série: mistura o seed do Major com a fase e o rótulo */
export function seriesSeed(c: MajorCampaign, m: PendingSeries): number {
  let h = (c.seed ^ 0x6d616a72) >>> 0;
  for (const ch of `${m.phase}:${m.label}:${m.a}:${m.b}`) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return h >>> 0;
}

/** diferença de rating (Elo do Major) vira vantagem em OVR na Sala */
export function edgeOf(mine: MajorTeam, opp: MajorTeam): number {
  return Math.max(-14, Math.min(14, Math.round((mine.rating - opp.rating) / 12)));
}

export interface MajorSeriesSetup {
  save: RoadToProSave;
  prep: MatchPrep;
}

/** monta o save + prep que a Sala (RtpRoundRoom / createRoom) consome */
export function majorSeriesSetup(d: MajorData, c: MajorCampaign, m: PendingSeries): MajorSeriesSetup {
  const teams = new Map(d.teams.map((t) => [t.id, t]));
  const mine = teams.get(c.teamId)!;
  const opp = teams.get(m.opp)!;
  const seed = seriesSeed(c, m);
  // o mesmo jogador em todas as séries da campanha (seed da campanha, não da série)
  const save = createRtpSave({
    nick: c.nick, country: mine.country.length === 2 ? mine.country : 'br', role: c.role,
    personality: 'resilient', archetype: 'allrounder', age: 22,
    categoryPoints: { mechanical: 4, mental: 4, physical: 4 },
    seed: (c.seed ^ 0x51ac) >>> 0, startTier: 'challenger',
  });
  // o scorebug da Sala mostra save.team: é o time do Major, não o do fixture
  save.team = { ...save.team, tag: mine.tag, logo: logoForName(mine.name, mine.id) ?? save.team.logo };
  const base = prepareCircuitMatch(save);
  if (!base) throw new Error('fixture do Major sem partida');
  const prep: MatchPrep = {
    ...base,
    matchSeed: seed,
    opp: {
      name: opp.name, tag: opp.tag, colors: opp.colors ?? ['#1b2433', '#c9a227'], logoUrl: logoForName(opp.name, opp.id),
      strength: save.player.ovr - edgeOf(mine, opp), players: [],
    },
    maps: pickMaps(makeRng(seed), m.bestOf),
    bestOf: m.bestOf,
    scout: undefined,
    grudge: 0,
  };
  return { save, prep };
}

/** fecha a série jogada na Sala e devolve a campanha com ela registrada */
export function recordSeries(
  d: MajorData, c: MajorCampaign, m: PendingSeries, outcomes: MomentOutcome[],
  liveMaps?: { map: MapId; score: [number, number]; won: boolean }[],
): MajorCampaign {
  const { save, prep } = majorSeriesSetup(d, c, m);
  const { result } = finishCircuitMatch(save, prep, outcomes, liveMaps);
  const [mineMaps, oppMaps] = result.mapScore;
  const userIsA = m.a === c.teamId;
  const rec: PlayedSeries = {
    phase: m.phase, label: m.label, a: m.a, b: m.b,
    winner: result.won ? c.teamId : m.opp,
    score: userIsA ? [mineMaps, oppMaps] : [oppMaps, mineMaps],
    heroRating: Math.round(result.heroRating * 100) / 100,
  };
  return { ...c, played: [...c.played, rec] };
}

/** simula a série do usuário sem jogar (botão "simular esta") */
export function simulatePending(c: MajorCampaign, d: MajorData, m: PendingSeries): MajorCampaign {
  const teams = new Map(d.teams.map((t) => [t.id, t]));
  const r = simSeries(teams.get(m.a)!, teams.get(m.b)!, m.bestOf, m.label, makeRng(seriesSeed(c, m)), m.phase);
  return { ...c, played: [...c.played, { phase: m.phase, label: m.label, a: m.a, b: m.b, winner: r.winner, score: r.score, heroRating: 0 }] };
}

/** valida uma campanha vinda do localStorage */
export function parseCampaign(d: MajorData, raw: unknown): MajorCampaign | null {
  const o = raw as Partial<MajorCampaign> | null;
  if (!o || o.v !== 1 || !Number.isFinite(o.seed) || typeof o.teamId !== 'string' || !Array.isArray(o.played)) return null;
  if (!d.teams.some((t) => t.id === o.teamId)) return null;
  const c = { v: 1 as const, seed: Number(o.seed) >>> 0, teamId: o.teamId, role: (o.role ?? 'Rifler') as Role, nick: String(o.nick ?? 'você').slice(0, 20), played: o.played as PlayedSeries[] };
  try { campaignView(d, c); } catch { return null; }
  return c;
}

// ---------------------------------------------------------------- estatísticas

export interface TeamStats {
  id: string;
  series: [number, number];  // vitórias, derrotas
  maps: [number, number];
  /** onde parou: 'Stage 1'…'Campeão' */
  finish: string;
}

/** séries, mapas e colocação de cada time no Major */
export function teamStats(d: MajorData, r: MajorResult): TeamStats[] {
  const s = new Map(d.teams.map((t) => [t.id, { id: t.id, series: [0, 0] as [number, number], maps: [0, 0] as [number, number], finish: '' }]));
  const all: MajorMatch[] = [...r.stages.flatMap((st) => st.rounds.flat()), ...r.playoffs.qf, ...r.playoffs.sf, r.playoffs.final];
  for (const m of all) {
    const A = s.get(m.a)!, B = s.get(m.b)!;
    (m.winner === m.a ? A : B).series[0]++;
    (m.winner === m.a ? B : A).series[1]++;
    A.maps[0] += m.score[0]; A.maps[1] += m.score[1];
    B.maps[0] += m.score[1]; B.maps[1] += m.score[0];
  }
  r.stages.forEach((st) => st.eliminated.forEach((id) => { s.get(id)!.finish = `Stage ${st.stage}`; }));
  r.playoffs.qf.forEach((m) => { s.get(m.winner === m.a ? m.b : m.a)!.finish = 'QF'; });
  r.playoffs.sf.forEach((m) => { s.get(m.winner === m.a ? m.b : m.a)!.finish = 'SF'; });
  const f = r.playoffs.final;
  s.get(f.winner === f.a ? f.b : f.a)!.finish = 'Final';
  s.get(f.winner)!.finish = 'Campeão';
  return [...s.values()];
}

export interface CampaignSummary {
  record: [number, number];
  maps: [number, number];
  avgRating: number | null;   // média do herói nas séries JOGADAS na Sala
  best: PlayedSeries | null;  // melhor série jogada
  mvp: boolean;               // seu jogador foi o MVP (campeão + rating ≥ 1.10)
}

export function campaignSummary(c: MajorCampaign, champion: string | null): CampaignSummary {
  const mine = c.played;
  const won = mine.filter((p) => p.winner === c.teamId).length;
  const maps: [number, number] = [0, 0];
  for (const p of mine) {
    const ia = p.a === c.teamId;
    maps[0] += ia ? p.score[0] : p.score[1];
    maps[1] += ia ? p.score[1] : p.score[0];
  }
  const rated = mine.filter((p) => p.heroRating > 0);
  const avg = rated.length ? Math.round((rated.reduce((a, p) => a + p.heroRating, 0) / rated.length) * 100) / 100 : null;
  const best = rated.length ? rated.reduce((a, p) => (p.heroRating > a.heroRating ? p : a)) : null;
  return { record: [won, mine.length - won], maps, avgRating: avg, best, mvp: champion === c.teamId && avg !== null && avg >= 1.1 };
}
