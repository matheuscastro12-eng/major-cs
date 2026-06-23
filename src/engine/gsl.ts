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
// rótulo de cada "rodada" do GSL (3 no total). Chaves PT estáveis: são
// traduzidas no consumo via ct(GSL_ROUND_LABELS[...]). NÃO envolver em ct()
// aqui — const de módulo é avaliada uma vez no import e congelaria o idioma.
export const GSL_ROUND_LABELS = ['Rodada de abertura', 'Vencedores + Eliminação', 'Decisão'];

const GROUP_KEYS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
// chaves de grupo ativas (pelo nº de grupos do torneio)
const activeKeys = (n: number) => GROUP_KEYS.slice(0, n);

// distribui os times em N grupos de 4 (snake por força: grupos equilibrados).
// ordem dentro do grupo = força desc (seed 1..4), pra Opening = S1vS4 / S2vS3.
function seedGroups(teams: TTeam[], nGroups: number): TTeam[][] {
  const sorted = [...teams].sort((a, b) => b.strength - a.strength);
  const groups: TTeam[][] = Array.from({ length: nGroups }, () => []);
  sorted.forEach((t, i) => {
    const cycle = Math.floor(i / nGroups);
    const pos = i % nGroups;
    const gi = cycle % 2 === 0 ? pos : nGroups - 1 - pos; // serpentina entre os grupos
    groups[gi].push(t);
  });
  return groups.map((g) => g.slice(0, 4));
}

const mWinner = (m: LeagueMatch): string => (m.result!.winner === 0 ? m.a : m.b);
const mLoser = (m: LeagueMatch): string => (m.result!.winner === 0 ? m.b : m.a);
const findTag = (l: League, tag: string): LeagueMatch | undefined =>
  l.rounds.flat().find((m) => m.tag === tag);

// monta a fase de grupos GSL a partir de N*4 times (16 = 4 grupos). Top 2 avançam.
export function createGSLStage(name: string, teams: TTeam[]): League {
  const nGroups = Math.max(2, Math.floor(teams.length / 4));
  const grouped = seedGroups(teams, nGroups);
  const inGroups = grouped.flat();
  const groups: string[][] = grouped.map((g) => g.map((t) => t.id));
  const opening: LeagueMatch[] = [];
  activeKeys(nGroups).forEach((g, gi) => {
    const s = groups[gi]; // seeds 0..3
    opening.push({ a: s[0], b: s[3], tag: `${g}-O1`, bo: 1 });
    opening.push({ a: s[1], b: s[2], tag: `${g}-O2`, bo: 1 });
  });
  return {
    name,
    teams: inGroups.map((t) => ({ ...t, wins: 0, losses: 0, roundDiff: 0, status: 'alive' as const })),
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
  const keys = activeKeys(l.gsl.groups.length);
  if (l.current === 1) {
    // gera Vencedores (winners x winners) e Eliminação (losers x losers) por grupo
    const next: LeagueMatch[] = [];
    keys.forEach((g) => {
      const o1 = findTag(l, `${g}-O1`)!;
      const o2 = findTag(l, `${g}-O2`)!;
      next.push({ a: mWinner(o1), b: mWinner(o2), tag: `${g}-WIN`, bo: 3 });
      next.push({ a: mLoser(o1), b: mLoser(o2), tag: `${g}-ELIM`, bo: 3 });
    });
    l.rounds.push(next);
  } else if (l.current === 2) {
    // 1º (vence Vencedores) e 4º (perde Eliminação) já definidos; gera Decisão
    const next: LeagueMatch[] = [];
    keys.forEach((g) => {
      const win = findTag(l, `${g}-WIN`)!;
      const elim = findTag(l, `${g}-ELIM`)!;
      l.gsl!.place[mWinner(win)] = 1;
      l.gsl!.place[mLoser(elim)] = 4;
      next.push({ a: mLoser(win), b: mWinner(elim), tag: `${g}-DEC`, bo: 3 });
    });
    l.rounds.push(next);
  } else if (l.current === 3) {
    // Decisão resolvida: 2º (vence) e 3º (perde)
    keys.forEach((g) => {
      const dec = findTag(l, `${g}-DEC`)!;
      l.gsl!.place[mWinner(dec)] = 2;
      l.gsl!.place[mLoser(dec)] = 3;
    });
  }
}

// os classificados (top 2 de cada grupo) em ordem de seed do playoff:
// [1A,1B,1C,1D, 2A,2B,2C,2D] — campeões de grupo são seeds 1..N, vices N+1..2N.
export function gslQualifiers(l: League): string[] {
  const byPlace = (gi: number, pl: number) => l.gsl!.groups[gi].find((id) => l.gsl!.place[id] === pl)!;
  const firsts = l.gsl!.groups.map((_, gi) => byPlace(gi, 1));
  const seconds = l.gsl!.groups.map((_, gi) => byPlace(gi, 2));
  return [...firsts, ...seconds];
}

// colocação do usuário no GSL: 1-2 = classificou; 3-4 = caiu no grupo.
export function gslUserPlace(l: League): number {
  return l.gsl?.place['user'] ?? 0;
}

// dados de render por grupo: nome do grupo + jogos por estágio + colocações.
export function gslGroupView(l: League) {
  if (!l.gsl) return [];
  return activeKeys(l.gsl.groups.length).map((g, gi) => ({
    key: g,
    teams: l.gsl!.groups[gi],
    place: l.gsl!.place,
    opening: l.rounds[0]?.filter((m) => m.tag?.startsWith(`${g}-O`)) ?? [],
    winners: findTag(l, `${g}-WIN`),
    elim: findTag(l, `${g}-ELIM`),
    decider: findTag(l, `${g}-DEC`),
  }));
}
