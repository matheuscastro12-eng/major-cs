// Formato real do CS: fase de grupos GSL (dupla eliminação) -> playoffs.
// Cada grupo tem 4 times e 5 jogos; 2 avançam. É o formato dos prints de
// IEM/BLAST/Major (Opening -> Winners/Elimination -> Decider). Reaproveita o
// tipo League (rounds/current) pra manter a UI de partida round-a-round.
import type { TTeam } from '../types';
import { simulateSeries } from './match';
import type { Rng } from './rng';
import { autoVeto } from './veto';
import type { League, LeagueMatch } from './league';
import { leagueTeam } from './league';

// rótulo de cada "rodada" do GSL (3 no total)
export const GSL_ROUND_LABELS = ['Rodada de abertura', 'Vencedores + Eliminação', 'Decisão'];

const GROUP_KEYS = ['A', 'B'] as const;

// distribui 8 times em 2 grupos de 4 (snake por força: grupos equilibrados).
// ordem dentro do grupo = força desc (seed 1..4), pra Opening = S1vS4 / S2vS3.
function seedGroups(teams: TTeam[]): [TTeam[], TTeam[]] {
  const sorted = [...teams].sort((a, b) => b.strength - a.strength);
  const A: TTeam[] = [];
  const B: TTeam[] = [];
  sorted.forEach((t, i) => {
    // snake: 0->A,1->B,2->B,3->A,4->A,5->B,6->B,7->A
    (i % 4 === 0 || i % 4 === 3 ? A : B).push(t);
  });
  return [A.slice(0, 4), B.slice(0, 4)];
}

const mWinner = (m: LeagueMatch): string => (m.result!.winner === 0 ? m.a : m.b);
const mLoser = (m: LeagueMatch): string => (m.result!.winner === 0 ? m.b : m.a);
const findTag = (l: League, tag: string): LeagueMatch | undefined =>
  l.rounds.flat().find((m) => m.tag === tag);

// monta a fase de grupos GSL a partir de 8 times.
export function createGSLStage(name: string, teams: TTeam[]): League {
  const [A, B] = seedGroups(teams);
  const groups: [string[], string[]] = [A.map((t) => t.id), B.map((t) => t.id)];
  const opening: LeagueMatch[] = [];
  GROUP_KEYS.forEach((g, gi) => {
    const s = groups[gi]; // seeds 0..3
    opening.push({ a: s[0], b: s[3], tag: `${g}-O1`, bo: 1 });
    opening.push({ a: s[1], b: s[2], tag: `${g}-O2`, bo: 1 });
  });
  return {
    name,
    teams: teams.map((t) => ({ ...t, wins: 0, losses: 0, roundDiff: 0, status: 'alive' as const })),
    rounds: [opening],
    current: 0,
    gsl: { groups, place: {} },
  };
}

export const gslDone = (l: League): boolean => l.current >= 3;

// resolve a rodada atual do GSL (simula o que falta), atualiza V/D e saldo,
// avança e GERA a próxima rodada a partir dos resultados (winners/elim -> decider).
export function resolveGSLRound(l: League, rng: Rng): void {
  const round = l.rounds[l.current];
  if (!round || !l.gsl) return;
  for (const m of round) {
    const a = leagueTeam(l, m.a);
    const b = leagueTeam(l, m.b);
    const bo = m.bo ?? 3;
    if (!m.result) m.result = simulateSeries(rng, a, b, autoVeto([a, b], rng, bo), bo);
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
  if (l.current === 1) {
    // gera Vencedores (winners x winners) e Eliminação (losers x losers) por grupo
    const next: LeagueMatch[] = [];
    GROUP_KEYS.forEach((g) => {
      const o1 = findTag(l, `${g}-O1`)!;
      const o2 = findTag(l, `${g}-O2`)!;
      next.push({ a: mWinner(o1), b: mWinner(o2), tag: `${g}-WIN`, bo: 3 });
      next.push({ a: mLoser(o1), b: mLoser(o2), tag: `${g}-ELIM`, bo: 3 });
    });
    l.rounds.push(next);
  } else if (l.current === 2) {
    // 1º (vence Vencedores) e 4º (perde Eliminação) já definidos; gera Decisão
    const next: LeagueMatch[] = [];
    GROUP_KEYS.forEach((g) => {
      const win = findTag(l, `${g}-WIN`)!;
      const elim = findTag(l, `${g}-ELIM`)!;
      l.gsl!.place[mWinner(win)] = 1;
      l.gsl!.place[mLoser(elim)] = 4;
      next.push({ a: mLoser(win), b: mWinner(elim), tag: `${g}-DEC`, bo: 3 });
    });
    l.rounds.push(next);
  } else if (l.current === 3) {
    // Decisão resolvida: 2º (vence) e 3º (perde)
    GROUP_KEYS.forEach((g) => {
      const dec = findTag(l, `${g}-DEC`)!;
      l.gsl!.place[mWinner(dec)] = 2;
      l.gsl!.place[mLoser(dec)] = 3;
    });
  }
}

// os 4 classificados, em ordem de seed do playoff (cross-group: 1A,1B,2A,2B).
// retorna ids; quem não jogou (placement só sai no fim) usa o place preenchido.
export function gslQualifiers(l: League): { firstA: string; firstB: string; secondA: string; secondB: string } {
  const byPlace = (gi: number, pl: number) => l.gsl!.groups[gi].find((id) => l.gsl!.place[id] === pl)!;
  return {
    firstA: byPlace(0, 1), firstB: byPlace(1, 1),
    secondA: byPlace(0, 2), secondB: byPlace(1, 2),
  };
}

// colocação do usuário no GSL: 1-2 = classificou; 3-4 = caiu no grupo.
export function gslUserPlace(l: League): number {
  return l.gsl?.place['user'] ?? 0;
}

// dados de render por grupo: nome do grupo + jogos por estágio + colocações.
export function gslGroupView(l: League) {
  if (!l.gsl) return [];
  return GROUP_KEYS.map((g, gi) => ({
    key: g,
    teams: l.gsl!.groups[gi],
    place: l.gsl!.place,
    opening: l.rounds[0]?.filter((m) => m.tag?.startsWith(`${g}-O`)) ?? [],
    winners: findTag(l, `${g}-WIN`),
    elim: findTag(l, `${g}-ELIM`),
    decider: findTag(l, `${g}-DEC`),
  }));
}
