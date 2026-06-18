// Lógica compartilhada do modo online. O draft e a simulação são
// determinísticos a partir do seed do lobby: todos os clientes computam
// exatamente as mesmas opções e o mesmo resultado, sem servidor de jogo.
import { BASE_TEAMS } from '../data/teams';
import { CS2_REAL_2026 } from '../data/bo3';
import { buildUserTeam, playerOvr, teamSeasonToTTeam } from '../engine/ratings';
import { simulateSeries } from '../engine/match';
import { makeRng, type Rng } from '../engine/rng';
import { autoVeto } from '../engine/veto';
import { hashStr } from './hash';
import { createTournamentFromTeams, placementCode, resolveRound, standings, type PlacementCode } from '../engine/swiss';
import type { MapId, Player, SeriesResult, TeamSeason, Tournament, TournamentPool, TTeam } from '../types';

export type UltimateRuleset = 'open' | 'current' | 'legends' | 'brworld' | 'era' | 'ovrcap' | 'unique_country' | 'gauntlet';
export type OnlineTactic = 'balanced' | 'aggressive' | 'tactical' | 'controlled';
export interface OnlineStrategy { tactic: OnlineTactic; favoriteMap: MapId; banMap: MapId }

export interface LobbyState {
  lobby: {
    code: string;
    mode: 'duel' | 'party';
    host: string;
    status: 'waiting' | 'drafting' | 'done';
    seed: number;
    run_seed?: number;
    pool: TournamentPool;
    locked?: boolean;
    season?: number;
    stage?: number;
    ruleset?: UltimateRuleset;
  };
  players: { nick: string; picks: string[]; coach_pick: string; done: boolean; ready_stage?: number; strategy?: OnlineStrategy }[];
}

// O Ultimate Team mistura cartas históricas com o elenco atual de 2026. As duas
// bases vêm do build (nunca do localStorage), então todos os clientes reconstroem
// exatamente o mesmo sorteio a partir do seed do lobby.
export function onlineDataset(pool: TournamentPool, ruleset: UltimateRuleset = 'open'): TeamSeason[] {
  let eligible = [...CS2_REAL_2026, ...BASE_TEAMS].filter((t) => t.players.length >= 5 && !t.pending);
  if (ruleset === 'current') eligible = eligible.filter((t) => t.id.startsWith('bo3_team_'));
  if (ruleset === 'legends') eligible = eligible.filter((t) => !t.id.startsWith('bo3_team_'));
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
  sources: TeamSeason[]; // 5 elencos sorteados
  coachOptions: TeamSeason[]; // 5 opções de coach
}

export function buildDraftFromSeed(seed: number, pool: TournamentPool, ruleset: UltimateRuleset = 'open'): OnlineDraftSetup {
  const rng = makeRng(seed);
  const base = onlineDataset(pool, ruleset);
  const sources = weightedSample(rng, base, 5);
  const used = new Set(sources.map((t) => t.id));
  const coachOptions = weightedSample(rng, base.filter((t) => !used.has(t.id)), 5);
  return { sources, coachOptions };
}


// CADA jogador recebe um sorteio DIFERENTE (mas determinístico por seed+nick,
// então todos os clientes reconstroem o mesmo elenco de cada jogador). Antes
// todos draftavam dos mesmos 5 elencos, o que deixava os times sempre iguais.
export function buildDraftForPlayer(seed: number, pool: TournamentPool, nick: string, ruleset: UltimateRuleset = 'open'): OnlineDraftSetup {
  return buildDraftFromSeed((seed ^ hashStr(nick.toLowerCase())) >>> 0, pool, ruleset);
}

export function teamFromPicks(
  nick: string,
  picks: string[],
  coachPick: string,
  setup: OnlineDraftSetup,
  strategy?: OnlineStrategy,
  ruleset: UltimateRuleset = 'open',
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
  let team = buildUserTeam(nick, chosen, coachTeam.coach);
  const plan = strategy ?? { tactic: 'balanced', favoriteMap: 'mirage', banMap: 'nuke' };
  const mapPrefs = { ...team.mapPrefs };
  mapPrefs[plan.favoriteMap] = Math.min(5, (mapPrefs[plan.favoriteMap] ?? 0) + 2);
  mapPrefs[plan.banMap] = Math.max(-5, (mapPrefs[plan.banMap] ?? 0) - 3);
  const tacticStrength = plan.tactic === 'aggressive' ? 1.1 : plan.tactic === 'tactical' ? 0.7 : plan.tactic === 'controlled' ? 0.45 : 0;
  const tacticTeamwork = plan.tactic === 'tactical' ? 2 : plan.tactic === 'controlled' ? 1.5 : plan.tactic === 'aggressive' ? -1 : 0;
  const avgOvr = team.players.reduce((sum, p) => sum + p.ovr, 0) / team.players.length;
  const capPenalty = ruleset === 'ovrcap' ? Math.max(0, avgOvr - 84) * 1.5 : 0;
  const roleDepth = new Set(chosen.map((c) => c.player.role)).size;
  const gauntletBonus = ruleset === 'gauntlet' ? (roleDepth - 3) * 0.8 : 0;
  const brCount = chosen.filter((c) => c.player.country === 'br').length;
  const brWorldBonus = ruleset === 'brworld' && brCount >= 2 && chosen.length - brCount >= 2 ? 1 : 0;
  team = {
    ...team,
    mapPrefs,
    strength: team.strength + tacticStrength - capPenalty + gauntletBonus + brWorldBonus,
    teamwork: team.teamwork + tacticTeamwork,
    playbook: plan.tactic === 'balanced' ? undefined : plan.tactic,
    playbookFam: plan.tactic === 'balanced' ? undefined : 0.72,
  };
  // ids de jogador PRECISAM ser únicos no torneio: dois jogadores podem draftar
  // a mesma lenda, e stats/killfeed/MVP são indexados por id
  const players = team.players.map((p) => ({ ...p, id: `online_${nick}__${p.sourcePlayerId}` }));
  return { ...team, id: `online_${nick}`, name: nick, isUser: false, players };
}

// ordenação ESTÁVEL entre clientes: comparação por code point (localeCompare
// depende do locale do navegador e quebraria o determinismo do Major online)
const byNickCodepoint = (x: { nick: string }, y: { nick: string }): number =>
  x.nick < y.nick ? -1 : x.nick > y.nick ? 1 : 0;

// ===================== DUELO ULTIMATE TEAM =====================

export interface OnlineDuel {
  teams: [TTeam, TTeam];
  nicks: [string, string];
  series: SeriesResult;
}

// Confronto direto MD3 para salas 1v1. Veto e série usam o mesmo RNG seedável,
// logo os dois navegadores exibem os mesmos mapas, rounds, kills e estatísticas.
export function simulateOnlineDuel(state: LobbyState): OnlineDuel | null {
  if (state.lobby.mode !== 'duel' || state.players.length < 2) return null;
  const ordered = [...state.players].sort(byNickCodepoint).slice(0, 2);
  const ruleset = state.lobby.ruleset ?? 'open';
  const teams = ordered.map((p) => {
    const setup = buildDraftForPlayer(state.lobby.seed, state.lobby.pool, p.nick, ruleset);
    return teamFromPicks(p.nick, p.picks ?? [], p.coach_pick ?? '', setup, p.strategy, ruleset);
  });
  if (!teams[0] || !teams[1]) return null;

  const pair = teams as [TTeam, TTeam];
  const rng = makeRng(((state.lobby.run_seed ?? state.lobby.seed) ^ 0x55544d) >>> 0);
  const maps = autoVeto(pair, rng, 3);
  return {
    teams: pair,
    nicks: [ordered[0].nick, ordered[1].nick],
    series: simulateSeries(rng, pair[0], pair[1], maps, 3),
  };
}

// ===================== MAJOR ONLINE (ultimate team) =====================
// Em vez de só os jogadores se enfrentarem, os times draftados entram num Major
// completo (16 times: jogadores + IA preenchendo) e disputam Suíça + playoffs
// juntos. Tudo determinístico pelo seed: todos os clientes veem o mesmo Major.

const MAJOR_SIZE = 16;

export interface OnlineMajor {
  tournament: Tournament;
  teamsById: Record<string, TTeam>;
  humanByTeamId: Record<string, string>; // teamId -> nick
  championId: string;
  championIsHuman: boolean;
  humans: { nick: string; teamId: string; placement: PlacementCode; wins: number; losses: number }[];
}

export function simulateOnlineMajor(state: LobbyState): OnlineMajor | null {
  const ordered = [...state.players].sort(byNickCodepoint);
  const ruleset = state.lobby.ruleset ?? 'open';

  const humanByTeamId: Record<string, string> = {};
  const humanTeams: TTeam[] = [];
  const usedSources = new Set<string>();
  for (const p of ordered) {
    // cada jogador draftou do PRÓPRIO sorteio (seed + nick)
    const setup = buildDraftForPlayer(state.lobby.seed, state.lobby.pool, p.nick, ruleset);
    const t = teamFromPicks(p.nick, p.picks ?? [], p.coach_pick ?? '', setup, p.strategy, ruleset);
    if (!t) return null; // alguém ainda não terminou o draft
    humanByTeamId[t.id] = p.nick;
    humanTeams.push(t);
    for (const s of setup.sources) usedSources.add(s.id);
  }

  // preenche com times da IA (determinístico), evitando repetir os elencos-fonte
  let aiPool = onlineDataset(state.lobby.pool, ruleset).filter((s) => !usedSources.has(s.id));
  const need = Math.max(0, MAJOR_SIZE - humanTeams.length);
  // pool regional pequeno demais (ex.: BR após edições no CRM): completa com o
  // mundo para o bracket de 16 nunca quebrar (seeds[7] exige 8 classificados)
  if (aiPool.length < need && state.lobby.pool !== 'world') {
    const haveIds = new Set([...usedSources, ...aiPool.map((s) => s.id)]);
    aiPool = [...aiPool, ...onlineDataset('world', ruleset).filter((s) => !haveIds.has(s.id))];
  }
  const runSeed = state.lobby.run_seed ?? state.lobby.seed;
  const aiRng = makeRng(runSeed + 4242);
  const aiTeams = weightedSample(aiRng, aiPool, need).map((s) => teamSeasonToTTeam(s));

  const tRng = makeRng(runSeed + 9999);
  const tournament = createTournamentFromTeams([...humanTeams, ...aiTeams], tRng, 'MAJOR ONLINE');
  let guard = 0;
  while (tournament.phase !== 'done' && guard++ < 40) resolveRound(tournament, tRng);

  const teamsById: Record<string, TTeam> = {};
  for (const t of tournament.teams) teamsById[t.id] = t;

  const championId = tournament.championId ?? '';
  const humans = ordered
    .map((p) => {
      const teamId = humanTeams.find((t) => humanByTeamId[t.id] === p.nick)!.id;
      const team = teamsById[teamId];
      return {
        nick: p.nick,
        teamId,
        placement: placementCode(tournament, teamId),
        wins: team?.wins ?? 0,
        losses: team?.losses ?? 0,
      };
    })
    .sort((a, b) => rankOfPlacement(a.placement) - rankOfPlacement(b.placement) || b.wins - a.wins || byNickCodepoint(a, b));

  return {
    tournament,
    teamsById,
    humanByTeamId,
    championId,
    championIsHuman: humanByTeamId[championId] !== undefined,
    humans,
  };
}

// ordem de exibição (menor = melhor colocação)
const PLACEMENT_RANK: Record<PlacementCode, number> = {
  champion: 0,
  runnerup: 1,
  semi: 2,
  quarters: 3,
  playoffs: 4,
  swiss: 5,
};
const rankOfPlacement = (code: PlacementCode): number => PLACEMENT_RANK[code];

// classificação final completa do Major (16 times) para exibição
export function majorStandings(major: OnlineMajor) {
  return standings(major.tournament).map((t) => ({
    team: t,
    isHuman: major.humanByTeamId[t.id] !== undefined,
    nick: major.humanByTeamId[t.id],
  }));
}

// ---- chamadas de API ----

export async function lobbyApi(body: Record<string, unknown>): Promise<{ ok?: boolean; code?: string; error?: string; stage?: number; advanced?: boolean }> {
  const res = await fetch('/api/lobby', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(9000),
  });
  return (await res.json()) as { ok?: boolean; code?: string; error?: string; stage?: number; advanced?: boolean };
}

export interface OpenRoom { code: string; mode: 'duel' | 'party'; pool: TournamentPool; host: string; players: number; max: number; }
export async function listOpenLobbies(): Promise<OpenRoom[]> {
  try {
    const res = await fetch('/api/lobby?list=1', { signal: AbortSignal.timeout(9000) });
    if (!res.ok) return [];
    const j = (await res.json()) as { rooms?: OpenRoom[] };
    return j.rooms ?? [];
  } catch {
    return [];
  }
}

// 'gone' = a sala não existe mais (expirou/foi encerrada); null = erro transitório
export async function fetchLobby(code: string): Promise<LobbyState | null | 'gone'> {
  try {
    const res = await fetch(`/api/lobby?code=${encodeURIComponent(code)}`, { signal: AbortSignal.timeout(9000) });
    if (res.status === 404) return 'gone';
    if (!res.ok) return null;
    return (await res.json()) as LobbyState;
  } catch {
    return null;
  }
}
