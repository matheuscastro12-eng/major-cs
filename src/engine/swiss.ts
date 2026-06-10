import type { Pairing, SeriesResult, TeamSeason, Tournament, TTeam } from '../types';
import { mergeLines, computeDisplay } from './match';
import { simulateSeries } from './match';
import { teamSeasonToTTeam } from './ratings';
import type { Rng } from './rng';
import { shuffle } from './rng';
import { autoVeto } from './veto';

export function getTeam(t: Tournament, id: string): TTeam {
  return t.teams.find((x) => x.id === id)!;
}

export function createTournament(dataset: TeamSeason[], user: TTeam, rng: Rng, name = 'MAJOR DOS SONHOS'): Tournament {
  const pool = shuffle(rng, dataset).slice(0, 15).map(teamSeasonToTTeam);
  const teams = [user, ...pool];
  const t: Tournament = {
    name,
    teams,
    phase: 'swiss',
    swissRound: 1,
    pairings: [],
    history: [],
  };
  t.pairings = makeSwissPairings(t, rng);
  return t;
}

function pastOpponents(t: Tournament, id: string): Set<string> {
  const s = new Set<string>();
  for (const h of t.history) {
    if (h.pairing.a === id) s.add(h.pairing.b);
    if (h.pairing.b === id) s.add(h.pairing.a);
  }
  return s;
}

function makeSwissPairings(t: Tournament, rng: Rng): Pairing[] {
  const alive = t.teams.filter((x) => x.status === 'alive');
  // agrupa por record
  const groups = new Map<string, TTeam[]>();
  for (const team of alive) {
    const key = `${team.wins}-${team.losses}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(team);
  }
  const pairings: Pairing[] = [];
  const sortedKeys = [...groups.keys()].sort((a, b) => Number(b.split('-')[0]) - Number(a.split('-')[0]));
  for (const key of sortedKeys) {
    const g = groups.get(key)!;
    // tenta evitar rematch
    let best: TTeam[] = g;
    for (let attempt = 0; attempt < 80; attempt++) {
      const cand = shuffle(rng, g);
      let ok = true;
      for (let i = 0; i < cand.length - 1; i += 2) {
        if (pastOpponents(t, cand[i].id).has(cand[i + 1].id)) {
          ok = false;
          break;
        }
      }
      if (ok) {
        best = cand;
        break;
      }
      best = cand;
    }
    for (let i = 0; i < best.length - 1; i += 2) {
      pairings.push({ a: best[i].id, b: best[i + 1].id, label: key });
    }
  }
  return pairings;
}

export function simulateAiSeries(t: Tournament, pairing: Pairing, rng: Rng): SeriesResult {
  const a = getTeam(t, pairing.a);
  const b = getTeam(t, pairing.b);
  const maps = autoVeto([a, b], rng);
  return simulateSeries(rng, a, b, maps);
}

function applySeries(t: Tournament, pairing: Pairing): void {
  const res = pairing.result!;
  const a = getTeam(t, pairing.a);
  const b = getTeam(t, pairing.b);
  const winner = res.winner === 0 ? a : b;
  const loser = res.winner === 0 ? b : a;
  winner.wins++;
  loser.losses++;
  for (const m of res.maps) {
    a.roundDiff += m.score[0] - m.score[1];
    b.roundDiff += m.score[1] - m.score[0];
  }
  if (t.phase === 'swiss') {
    if (winner.wins >= 3) winner.status = 'advanced';
    if (loser.losses >= 3) loser.status = 'eliminated';
  } else {
    loser.status = 'eliminated';
  }
  t.history.push({ phase: phaseLabel(t), pairing });
}

export function phaseLabel(t: Tournament): string {
  if (t.phase === 'swiss') return `Suíça — Rodada ${t.swissRound}`;
  if (t.phase === 'quarters') return 'Quartas de final';
  if (t.phase === 'semis') return 'Semifinal';
  if (t.phase === 'final') return 'GRANDE FINAL';
  return 'Encerrado';
}

function seedAdvanced(t: Tournament): TTeam[] {
  return t.teams
    .filter((x) => x.status === 'advanced')
    .sort((a, b) => a.losses - b.losses || b.roundDiff - a.roundDiff || b.strength - a.strength);
}

// Resolve a rodada atual: simula partidas sem resultado e avança a fase
export function resolveRound(t: Tournament, rng: Rng): Tournament {
  for (const p of t.pairings) {
    if (!p.result) p.result = simulateAiSeries(t, p, rng);
    applySeries(t, p);
  }

  if (t.phase === 'swiss') {
    const stillAlive = t.teams.filter((x) => x.status === 'alive');
    if (t.swissRound < 5 && stillAlive.length > 0) {
      t.swissRound++;
      t.pairings = makeSwissPairings(t, rng);
    } else {
      t.phase = 'quarters';
      const seeds = seedAdvanced(t);
      for (const s of seeds) s.status = 'alive';
      t.pairings = [
        { a: seeds[0].id, b: seeds[7].id, label: 'QF1' },
        { a: seeds[3].id, b: seeds[4].id, label: 'QF2' },
        { a: seeds[1].id, b: seeds[6].id, label: 'QF3' },
        { a: seeds[2].id, b: seeds[5].id, label: 'QF4' },
      ];
    }
  } else if (t.phase === 'quarters') {
    const w = t.pairings.map((p) => (p.result!.winner === 0 ? p.a : p.b));
    t.phase = 'semis';
    t.pairings = [
      { a: w[0], b: w[1], label: 'SF1' },
      { a: w[2], b: w[3], label: 'SF2' },
    ];
  } else if (t.phase === 'semis') {
    const w = t.pairings.map((p) => (p.result!.winner === 0 ? p.a : p.b));
    t.phase = 'final';
    t.pairings = [{ a: w[0], b: w[1], label: 'FINAL' }];
  } else if (t.phase === 'final') {
    const p = t.pairings[0];
    t.championId = p.result!.winner === 0 ? p.a : p.b;
    t.phase = 'done';
    t.pairings = [];
    t.mvpId = computeMvp(t);
  }
  return t;
}

function computeMvp(t: Tournament): string | undefined {
  if (!t.championId) return undefined;
  const champ = getTeam(t, t.championId);
  let best: { id: string; rating: number } | undefined;
  for (const p of champ.players) {
    const lines = [];
    for (const h of t.history) {
      const res = h.pairing.result;
      if (!res) continue;
      for (const m of res.maps) {
        const st = m.stats[p.id];
        if (st) lines.push(st.both);
      }
    }
    if (lines.length === 0) continue;
    const d = computeDisplay(mergeLines(lines));
    if (!best || d.rating > best.rating) best = { id: p.id, rating: d.rating };
  }
  return best?.id;
}

export function userPairing(t: Tournament): Pairing | undefined {
  return t.pairings.find((p) => p.a === 'user' || p.b === 'user');
}

export function userTeam(t: Tournament): TTeam {
  return getTeam(t, 'user');
}

// classificação para exibição da fase suíça
export function standings(t: Tournament): TTeam[] {
  return [...t.teams].sort((a, b) => {
    const stOrder = (s: TTeam) => (s.status === 'advanced' ? 0 : s.status === 'alive' ? 1 : 2);
    return stOrder(a) - stOrder(b) || b.wins - a.wins || a.losses - b.losses || b.roundDiff - a.roundDiff;
  });
}
