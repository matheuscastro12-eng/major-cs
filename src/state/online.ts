// Lógica compartilhada do modo online. O draft e a simulação são
// determinísticos a partir do seed do lobby: todos os clientes computam
// exatamente as mesmas opções e o mesmo resultado, sem servidor de jogo.
import { BASE_TEAMS } from '../data/teams';
import { simulateSeries } from '../engine/match';
import { buildUserTeam, playerOvr } from '../engine/ratings';
import { makeRng, type Rng } from '../engine/rng';
import { autoVeto } from '../engine/veto';
import type { Player, SeriesResult, TeamSeason, TournamentPool, TTeam } from '../types';

export interface LobbyState {
  lobby: {
    code: string;
    mode: 'duel' | 'party';
    host: string;
    status: 'waiting' | 'drafting' | 'done';
    seed: number;
    pool: TournamentPool;
  };
  players: { nick: string; picks: string[]; coach_pick: string; done: boolean }[];
}

// IMPORTANTE: o online usa sempre a base padrão (BASE_TEAMS), nunca o
// dataset customizado do localStorage, para todos os clientes verem o mesmo.
export function onlineDataset(pool: TournamentPool): TeamSeason[] {
  const eligible = BASE_TEAMS.filter((t) => t.players.length >= 5 && !t.pending);
  return pool === 'br' ? eligible.filter((t) => t.country === 'br') : eligible;
}

const tierWeight = (t: TeamSeason) => {
  const avg = t.players.slice(0, 5).reduce((s, p) => s + playerOvr(p), 0) / Math.min(5, t.players.length);
  if (avg >= 90) return 0.55;
  if (avg >= 87) return 1.1;
  if (avg >= 83) return 2.2;
  return 2.9;
};

function weightedSample(rng: Rng, teams: TeamSeason[], n: number): TeamSeason[] {
  const pool = [...teams];
  const out: TeamSeason[] = [];
  while (out.length < n && pool.length > 0) {
    const weights = pool.map(tierWeight);
    const total = weights.reduce((s, w) => s + w, 0);
    let r = rng() * total;
    let idx = 0;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) {
        idx = i;
        break;
      }
    }
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

export interface OnlineDraftSetup {
  sources: TeamSeason[]; // 5 elencos sorteados (iguais para todos)
  coachOptions: TeamSeason[]; // 5 opções de coach
}

export function buildDraftFromSeed(seed: number, pool: TournamentPool): OnlineDraftSetup {
  const rng = makeRng(seed);
  const base = onlineDataset(pool);
  const sources = weightedSample(rng, base, 5);
  const used = new Set(sources.map((t) => t.id));
  const coachOptions = weightedSample(rng, base.filter((t) => !used.has(t.id)), 5);
  return { sources, coachOptions };
}

export function teamFromPicks(
  nick: string,
  picks: string[],
  coachPick: string,
  setup: OnlineDraftSetup,
): TTeam | null {
  const chosen: { player: Player; from: TeamSeason }[] = [];
  for (let i = 0; i < 5; i++) {
    const from = setup.sources[i];
    if (!from) return null;
    // pick válido, ou fallback determinístico (1º jogador do elenco) para
    // jogadores que abandonaram o draft: nunca trava os resultados da sala
    const player = (picks[i] && from.players.find((p) => p.id === picks[i])) || from.players[0];
    chosen.push({ player, from });
  }
  const coachTeam = setup.coachOptions.find((t) => t.id === coachPick) ?? setup.coachOptions[0];
  const team = buildUserTeam(nick, chosen, coachTeam.coach);
  return { ...team, id: `online_${nick}`, name: nick, isUser: false };
}

export interface OnlineMatch {
  a: string;
  b: string;
  series: SeriesResult;
}

export interface OnlineResults {
  matches: OnlineMatch[];
  standings: { nick: string; wins: number; losses: number; mapDiff: number }[];
  champion: string;
  teams: Record<string, TTeam>;
}

// Resultados determinísticos: round-robin MD3 entre todos os jogadores.
// Ordem fixa (nicks ordenados) garante o mesmo resultado em todos os clientes.
export function simulateOnlineResults(state: LobbyState): OnlineResults | null {
  const setup = buildDraftFromSeed(state.lobby.seed, state.lobby.pool);
  const ordered = [...state.players].sort((x, y) => x.nick.localeCompare(y.nick));
  const teams: Record<string, TTeam> = {};
  for (const p of ordered) {
    const t = teamFromPicks(p.nick, p.picks ?? [], p.coach_pick ?? '', setup);
    if (!t) return null; // alguém ainda não terminou
    teams[p.nick] = t;
  }

  const rng = makeRng(state.lobby.seed + 7777);
  const matches: OnlineMatch[] = [];
  const score = new Map<string, { wins: number; losses: number; mapDiff: number }>();
  for (const p of ordered) score.set(p.nick, { wins: 0, losses: 0, mapDiff: 0 });

  for (let i = 0; i < ordered.length; i++) {
    for (let j = i + 1; j < ordered.length; j++) {
      const a = teams[ordered[i].nick];
      const b = teams[ordered[j].nick];
      const maps = autoVeto([a, b], rng);
      const series = simulateSeries(rng, a, b, maps);
      matches.push({ a: ordered[i].nick, b: ordered[j].nick, series });
      const winNick = series.winner === 0 ? ordered[i].nick : ordered[j].nick;
      const loseNick = series.winner === 0 ? ordered[j].nick : ordered[i].nick;
      score.get(winNick)!.wins++;
      score.get(loseNick)!.losses++;
      for (const m of series.maps) {
        score.get(ordered[i].nick)!.mapDiff += m.score[0] - m.score[1];
        score.get(ordered[j].nick)!.mapDiff += m.score[1] - m.score[0];
      }
    }
  }

  const standings = ordered
    .map((p) => ({ nick: p.nick, ...score.get(p.nick)! }))
    .sort((x, y) => y.wins - x.wins || y.mapDiff - x.mapDiff || x.nick.localeCompare(y.nick));

  return { matches, standings, champion: standings[0]?.nick ?? '', teams };
}

// ---- chamadas de API ----

export async function lobbyApi(body: Record<string, unknown>): Promise<{ ok?: boolean; code?: string; error?: string }> {
  const res = await fetch('/api/lobby', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(9000),
  });
  return (await res.json()) as { ok?: boolean; code?: string; error?: string };
}

export async function fetchLobby(code: string): Promise<LobbyState | null> {
  try {
    const res = await fetch(`/api/lobby?code=${encodeURIComponent(code)}`, { signal: AbortSignal.timeout(9000) });
    if (!res.ok) return null;
    return (await res.json()) as LobbyState;
  } catch {
    return null;
  }
}
