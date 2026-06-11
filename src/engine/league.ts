// Liga de pontos corridos (round-robin) para o modo carreira (Circuit X).
// Agenda determinística pelo método do círculo; simulação via engine padrão.
import type { SeriesResult, TTeam } from '../types';
import { simulateSeries } from './match';
import type { Rng } from './rng';
import { autoVeto } from './veto';

export interface LeagueMatch {
  a: string;
  b: string;
  result?: SeriesResult;
}

export interface League {
  name: string;
  teams: TTeam[];
  rounds: LeagueMatch[][];
  current: number; // índice da rodada atual (0-based)
}

// tabela round-robin pelo método do círculo (sem rng: a ordem dos times define)
export function createLeague(name: string, teams: TTeam[]): League {
  const ids = teams.map((t) => t.id);
  if (ids.length % 2 === 1) ids.push('__bye__');
  const n = ids.length;
  const rounds: LeagueMatch[][] = [];
  const rot = ids.slice(1);
  for (let r = 0; r < n - 1; r++) {
    const left = [ids[0], ...rot.slice(0, n / 2 - 1)];
    const right = rot.slice(n / 2 - 1).reverse();
    const ms: LeagueMatch[] = [];
    for (let i = 0; i < n / 2; i++) {
      if (left[i] !== '__bye__' && right[i] !== '__bye__') ms.push({ a: left[i], b: right[i] });
    }
    rounds.push(ms);
    rot.unshift(rot.pop()!);
  }
  return {
    name,
    teams: teams.map((t) => ({ ...t, wins: 0, losses: 0, roundDiff: 0, status: 'alive' as const })),
    rounds,
    current: 0,
  };
}

export function leagueTeam(l: League, id: string): TTeam {
  return l.teams.find((t) => t.id === id)!;
}

export function userLeagueMatch(l: League): LeagueMatch | undefined {
  return l.rounds[l.current]?.find((m) => m.a === 'user' || m.b === 'user');
}

export function leagueDone(l: League): boolean {
  return l.current >= l.rounds.length;
}

// resolve a rodada atual: simula o que não tem resultado e aplica na tabela
export function resolveLeagueRound(l: League, rng: Rng, bestOf: 1 | 3 = 3): void {
  const round = l.rounds[l.current];
  if (!round) return;
  for (const m of round) {
    const a = leagueTeam(l, m.a);
    const b = leagueTeam(l, m.b);
    if (!m.result) {
      m.result = simulateSeries(rng, a, b, autoVeto([a, b], rng, bestOf), bestOf);
    }
    const w = m.result.winner === 0 ? a : b;
    const lo = m.result.winner === 0 ? b : a;
    w.wins++;
    lo.losses++;
    for (const map of m.result.maps) {
      a.roundDiff += map.score[0] - map.score[1];
      b.roundDiff += map.score[1] - map.score[0];
    }
  }
  l.current++;
}

export function leagueTable(l: League): TTeam[] {
  return [...l.teams].sort(
    (a, b) => b.wins - a.wins || b.roundDiff - a.roundDiff || (a.name < b.name ? -1 : 1),
  );
}
