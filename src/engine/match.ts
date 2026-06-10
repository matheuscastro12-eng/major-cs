import type { KillEvent, MapId, MapResult, PlayerLine, PlayerMapStats, SeriesResult, TPlayer, TTeam } from '../types';
import type { Rng } from './rng';
import { weightedIndex } from './rng';

function emptyLine(): PlayerLine {
  return { kills: 0, deaths: 0, assists: 0, dmg: 0, kastRounds: 0, rounds: 0, openKills: 0, clutchWins: 0 };
}

function emptyStats(): PlayerMapStats {
  return { both: emptyLine(), t: emptyLine(), ct: emptyLine() };
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

const KILL_ROLE_MULT: Record<string, number> = {
  Entry: 1.12,
  AWP: 1.08,
  Rifler: 1.0,
  Lurker: 0.98,
  Support: 0.85,
  IGL: 0.78,
};

const DEATH_ROLE_MULT: Record<string, number> = {
  Entry: 1.25,
  AWP: 0.92,
  Rifler: 1.0,
  Lurker: 0.9,
  Support: 1.05,
  IGL: 1.02,
};

interface RoundTally {
  kills: number[];
  killers: number[];
  assists: number[];
  died: boolean[];
  open: number;
  clutch: number;
}

interface CompFlags {
  hasAwp: boolean;
  hasIgl: boolean;
}

function newRoundTally(): RoundTally {
  return {
    kills: [0, 0, 0, 0, 0],
    killers: [],
    assists: [0, 0, 0, 0, 0],
    died: [false, false, false, false, false],
    open: -1,
    clutch: -1,
  };
}

function compFlags(team: TTeam): CompFlags {
  return {
    hasAwp: team.players.some((p) => p.awp >= 80),
    hasIgl: team.players.some((p) => p.igl >= 80),
  };
}

function weaponFor(p: TPlayer, rng: Rng, isPistol: boolean, side: 'ct' | 't'): string {
  if (isPistol) {
    if (rng() < 0.12) return 'deagle';
    return side === 'ct' ? 'usp' : 'glock';
  }
  if (p.role === 'AWP' && rng() < 0.62) return 'awp';
  if (rng() < 0.02) return 'knife';
  if (rng() < 0.08) return 'deagle';
  if (p.role === 'IGL' && rng() < 0.14) return 'galil';
  // crossover de rifle (CT pega AK no chão e vice-versa) em ~12% dos casos
  const main = side === 't' ? 'ak47' : 'm4';
  const off = side === 't' ? 'm4' : 'ak47';
  return rng() < 0.88 ? main : off;
}

function effStrength(
  team: TTeam,
  flags: CompFlags,
  map: MapId,
  side: 'ct' | 't',
  wonLast: boolean,
  lostLast: boolean,
  isPistol: boolean,
  secondHalf: boolean,
  pickedOwnMap: boolean,
): number {
  let s = team.strength + (team.mapPrefs[map] ?? 0) * 1.35;
  if (side === 'ct') s += 1.1;
  if (wonLast && !isPistol) s += 2.1;

  if (!flags.hasIgl) {
    s -= 1.5;
    if (secondHalf) s -= 1.8;
  }
  if (!flags.hasAwp && side === 'ct') s -= 1.8;

  const c = team.coach;
  const cPow = Math.max(0, (c.rating - 75) / 12);
  if (c.style === 'tactical' && pickedOwnMap) s += 1.2 + cPow;
  if (c.style === 'tactical' && !flags.hasIgl) s += 1.2;
  if (c.style === 'aggressive' && side === 't') s += 0.9 + cPow * 0.6;
  if (c.style === 'discipline' && lostLast && !isPistol) s += 1.4 + cPow * 0.5;

  return s;
}

export function simulateMap(rng: Rng, a: TTeam, b: TTeam, map: MapId, pickedBy: 0 | 1 | -1): MapResult {
  const stats: Record<string, PlayerMapStats> = {};
  for (const p of [...a.players, ...b.players]) stats[p.id] = emptyStats();

  let scoreA = 0;
  let scoreB = 0;
  let target = 13;
  let ot = false;
  let lastWinner: 0 | 1 | -1 = -1;
  const roundLog: (0 | 1)[] = [];
  const killFeed: KillEvent[] = [];
  const aStartsCt = rng() < 0.5;
  let halfScore = '';

  const teamPlayers: [TPlayer[], TPlayer[]] = [a.players, b.players];
  const flagsA = compFlags(a);
  const flagsB = compFlags(b);

  let round = 0;
  while (true) {
    let aSide: 'ct' | 't';
    if (round < 12) aSide = aStartsCt ? 'ct' : 't';
    else if (round < 24) aSide = aStartsCt ? 't' : 'ct';
    else {
      const block = Math.floor((round - 24) / 3);
      aSide = block % 2 === 0 ? (aStartsCt ? 'ct' : 't') : aStartsCt ? 't' : 'ct';
    }
    const bSide: 'ct' | 't' = aSide === 'ct' ? 't' : 'ct';
    const isPistol = round === 0 || round === 12;
    const secondHalf = round >= 12;

    const effA = effStrength(a, flagsA, map, aSide, lastWinner === 0, lastWinner === 1, isPistol, secondHalf, pickedBy === 0);
    const effB = effStrength(b, flagsB, map, bSide, lastWinner === 1, lastWinner === 0, isPistol, secondHalf, pickedBy === 1);
    const diff = isPistol ? (effA - effB) * 0.45 : effA - effB;
    const pA = sigmoid(diff / 15);
    const winner: 0 | 1 = rng() < pA ? 0 : 1;

    const closeness = 1 - Math.abs(pA - 0.5) * 2;
    const wLoser = [2.1 - 1.2 * closeness, 1.6, 1.15 + 0.55 * closeness, 0.6 + 0.65 * closeness, 0.2 + 0.5 * closeness];
    const loserKills = weightedIndex(rng, wLoser);
    let savers = 0;
    if (loserKills <= 1) {
      const r = rng();
      savers = r < 0.18 ? 2 : r < 0.55 ? 1 : 0;
    } else if (rng() < 0.22) {
      savers = 1;
    }
    const winnerKills = 5 - savers;

    const winIdx = winner;
    const loseIdx: 0 | 1 = winner === 0 ? 1 : 0;
    const tally: [RoundTally, RoundTally] = [newRoundTally(), newRoundTally()];

    const assign = (teamIdx: 0 | 1, nKills: number, firstIsOpen: boolean) => {
      const ps = teamPlayers[teamIdx];
      const weights = ps.map((p) => Math.pow(p.aim / 70, 2.6) * (KILL_ROLE_MULT[p.role] ?? 1));
      for (let k = 0; k < nKills; k++) {
        const i = weightedIndex(rng, weights);
        tally[teamIdx].kills[i]++;
        tally[teamIdx].killers.push(i);
        weights[i] *= 0.32;
        if (k === 0 && firstIsOpen) tally[teamIdx].open = i;
        if (rng() < 0.3) {
          let j = Math.floor(rng() * ps.length);
          if (j === i) j = (j + 1) % ps.length;
          tally[teamIdx].assists[j]++;
        }
      }
    };

    const winnerOpens = rng() < 0.62;
    assign(winIdx, winnerKills, winnerOpens);
    assign(loseIdx, loserKills, !winnerOpens && loserKills > 0);

    const pickVictims = (teamIdx: 0 | 1, deaths: number) => {
      const ps = teamPlayers[teamIdx];
      const idxs = [0, 1, 2, 3, 4];
      const weights = ps.map((p) => (DEATH_ROLE_MULT[p.role] ?? 1) * (110 - p.consistency));
      const chosen: number[] = [];
      for (let d = 0; d < deaths; d++) {
        const avail = idxs.filter((i) => !chosen.includes(i));
        const aw = avail.map((i) => weights[i]);
        const c = avail[weightedIndex(rng, aw)];
        chosen.push(c);
      }
      for (const c of chosen) tally[teamIdx].died[c] = true;
    };
    pickVictims(loseIdx, winnerKills);
    pickVictims(winIdx, loserKills);

    const eventsFor = (killerTeam: 0 | 1, victimTeam: 0 | 1): KillEvent[] => {
      const killers = tally[killerTeam].killers;
      const victims = tally[victimTeam].died.map((died, i) => (died ? i : -1)).filter((i) => i >= 0);
      const killerSide = killerTeam === 0 ? aSide : bSide;
      return killers.slice(0, victims.length).map((killerIdx, i) => {
        const killer = teamPlayers[killerTeam][killerIdx];
        return {
          round: round + 1,
          killerId: killer.id,
          victimId: teamPlayers[victimTeam][victims[i]].id,
          killerTeam,
          victimTeam,
          weapon: weaponFor(killer, rng, isPistol, killerSide),
          headshot: rng() < (killer.role === 'AWP' ? 0.18 : 0.43),
          opening: false,
          trade: i > 0 && rng() < 0.28,
        };
      });
    };
    const winEvents = eventsFor(winIdx, loseIdx);
    const loseEvents = eventsFor(loseIdx, winIdx);
    const roundEvents = winnerOpens ? [...winEvents, ...loseEvents] : [...loseEvents, ...winEvents];
    if (roundEvents[0]) roundEvents[0].opening = true;
    killFeed.push(...roundEvents);

    if (loserKills >= 3 && rng() < 0.45) {
      const ps = teamPlayers[winIdx];
      const alive = ps.map((_, i) => i).filter((i) => !tally[winIdx].died[i]);
      if (alive.length > 0 && alive.length <= 2) {
        const cw = alive.map((i) => ps[i].clutch);
        tally[winIdx].clutch = alive[weightedIndex(rng, cw)];
      }
    }

    const sides: ['ct' | 't', 'ct' | 't'] = [aSide, bSide];
    for (const ti of [0, 1] as const) {
      const ps = teamPlayers[ti];
      const side = sides[ti];
      for (let i = 0; i < ps.length; i++) {
        const st = stats[ps[i].id];
        const kills = tally[ti].kills[i];
        const assists = tally[ti].assists[i];
        const died = tally[ti].died[i];
        let dmg = 0;
        for (let k = 0; k < kills; k++) dmg += 70 + rng() * 38;
        dmg += rng() * 24;
        if (assists > 0) dmg += assists * (22 + rng() * 16);
        dmg = Math.min(dmg, 5 * 100 + 60);

        const survived = !died;
        const traded = died && rng() < 0.25;
        const kast = kills > 0 || assists > 0 || survived || traded;

        for (const line of [st.both, side === 'ct' ? st.ct : st.t]) {
          line.rounds++;
          line.kills += kills;
          line.assists += assists;
          line.deaths += died ? 1 : 0;
          line.dmg += dmg;
          if (kast) line.kastRounds++;
          if (tally[ti].open === i) line.openKills++;
          if (tally[ti].clutch === i) line.clutchWins++;
        }
      }
    }

    if (winner === 0) scoreA++;
    else scoreB++;
    roundLog.push(winner);
    lastWinner = winner;
    round++;

    if (round === 12) halfScore = `${scoreA}:${scoreB}`;
    if (scoreA >= target || scoreB >= target) break;
    if (scoreA === 12 && scoreB === 12 && target === 13) {
      target = 16;
      ot = true;
    } else if (ot && round >= 42 && scoreA === scoreB) {
      target = scoreA + 1;
    } else if (ot && scoreA === target - 1 && scoreB === target - 1) {
      target += 3;
    }
    if (round > 60) break;
  }

  return {
    map,
    pickedBy,
    score: [scoreA, scoreB],
    halves: halfScore ? `1o half ${halfScore}` : '',
    ot,
    winner: scoreA > scoreB ? 0 : 1,
    roundLog,
    killFeed,
    stats,
  };
}

export function simulateSeries(rng: Rng, a: TTeam, b: TTeam, maps: { map: MapId; pickedBy: 0 | 1 | -1 }[]): SeriesResult {
  const results: MapResult[] = [];
  let winsA = 0;
  let winsB = 0;
  for (const m of maps) {
    if (winsA === 2 || winsB === 2) break;
    const r = simulateMap(rng, a, b, m.map, m.pickedBy);
    results.push(r);
    if (r.winner === 0) winsA++;
    else winsB++;
  }
  return {
    teamIds: [a.id, b.id],
    maps: results,
    winner: winsA > winsB ? 0 : 1,
    mapScore: [winsA, winsB],
  };
}

export interface DisplayLine {
  kills: number;
  deaths: number;
  adr: number;
  kast: number;
  swing: number;
  rating: number;
}

export function computeDisplay(line: PlayerLine): DisplayLine {
  const r = Math.max(1, line.rounds);
  const kpr = line.kills / r;
  const dpr = line.deaths / r;
  const apr = line.assists / r;
  const adr = line.dmg / r;
  const kastPct = (line.kastRounds / r) * 100;
  const impact = Math.max(0, 2.13 * kpr + 0.42 * apr - 0.41);
  const rating2 = 0.0073 * kastPct + 0.3591 * kpr - 0.5329 * dpr + 0.2372 * impact + 0.0032 * adr + 0.1587;
  const rating = Math.max(0, (rating2 - 1) * 1.18 + 1);
  const swing = ((line.kills - line.deaths) / r) * 22 + (line.kastRounds / r - 0.7) * 9 + (line.openKills / r) * 6 + (line.clutchWins / r) * 8;
  return {
    kills: line.kills,
    deaths: line.deaths,
    adr,
    kast: kastPct,
    swing,
    rating,
  };
}

export function mergeLines(lines: PlayerLine[]): PlayerLine {
  const out = emptyLine();
  for (const l of lines) {
    out.kills += l.kills;
    out.deaths += l.deaths;
    out.assists += l.assists;
    out.dmg += l.dmg;
    out.kastRounds += l.kastRounds;
    out.rounds += l.rounds;
    out.openKills += l.openKills;
    out.clutchWins += l.clutchWins;
  }
  return out;
}
