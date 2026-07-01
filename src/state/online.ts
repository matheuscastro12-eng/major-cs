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
import { createTournamentFromTeams, pairingBestOf, placementCode, resolveRound, standings, type PlacementCode } from '../engine/swiss';
import type { MapId, Pairing, Player, SeriesResult, TeamSeason, Tournament, TournamentPool, TTeam } from '../types';

export type UltimateRuleset = 'open' | 'current' | 'legends' | 'brworld' | 'era' | 'ovrcap' | 'unique_country' | 'gauntlet';
export type OnlineTactic = 'balanced' | 'aggressive' | 'tactical' | 'controlled';
export type PlaybackSpeed = 0.5 | 1 | 2 | 4 | 8;
export type OnlinePace = 'aggressive' | 'default' | 'cautious';
export interface OnlineStrategy {
  tactic: OnlineTactic;
  favoriteMap: MapId;
  banMap: MapId;
  pace?: OnlinePace;
  timeoutMap?: number;
  substituteAfterMap?: boolean;
}
export interface OnlineLineup { captainId: string; reserveId: string }
export interface OnlineVetoState {
  step: number;
  remaining: MapId[];
  bans: { map: MapId; by: string }[];
  picks: { map: MapId; by: string }[];
  turn?: string;
  deadline?: number;
  maps?: MapId[];
}
export interface OnlineMajorVetoState {
  steps: { team: 0 | 1 | -1; action: 'ban' | 'pick' | 'decider'; map?: MapId }[];
  remaining: MapId[];
  bestOf: 1 | 3 | 5;
  participants: [string | null, string | null];
  maps?: { map: MapId; pickedBy: 0 | 1 | -1 }[];
}

// entrada do snapshot de elenco congelado (run_roster)
export interface RosterEntry {
  nick: string;
  picks: string[];
  coach_pick: string;
  strategy?: OnlineStrategy;
  lineup?: OnlineLineup;
  rollouts?: number[];
}

export interface LobbyState {
  lobby: {
    code: string;
    mode: 'duel' | 'party';
    host: string;
    name?: string;
    status: 'waiting' | 'drafting' | 'veto' | 'done';
    seed: number;
    run_seed?: number;
    pool: TournamentPool;
    locked?: boolean;
    ranked?: boolean;
    season?: number;
    stage?: number;
    ruleset?: UltimateRuleset;
    playback_speed?: PlaybackSpeed;
    draft_rollouts?: number;
    stage_started_at?: number;
    veto?: OnlineVetoState;
    major_vetos?: Record<string, OnlineMajorVetoState>;
    // SNAPSHOT congelado do elenco da corrida (gravado quando o Major começa).
    // O bracket é simulado a partir DESTE snapshot, não dos players ao vivo —
    // assim entrar/sair da sala não re-embaralha resultados já jogados.
    run_roster?: RosterEntry[] | null;
    // RESULTADOS AUTORITATIVOS reportados: o jogador dono da partida manda só o
    // DESFECHO (vencedor + placar de mapas) ao terminar; o bracket usa isso como
    // verdade. Round-a-round NÃO trafega — fica local. Imune a divergência entre
    // versões. Chave = `${stage}:${pairing.a}|${pairing.b}`.
    stage_results?: Record<string, { winner: 0 | 1; mapScore: [number, number] }>;
  };
  players: {
    nick: string;
    picks: string[];
    coach_pick: string;
    done: boolean;
    ready_stage?: number;
    strategy?: OnlineStrategy;
    lineup?: OnlineLineup;
    rollouts?: number[];
    spectator?: boolean;
    squad?: UltimatePvpSquad | null; // Ultimate PvP: snapshot do squad persistente
  }[];
  serverNow?: number; // Date.now() do servidor no momento da resposta (correção de skew)
}

// snapshot compacto do squad no Ultimate PvP (mode 'ultimate'): os pids referem
// o MESMO dataset em todos os clientes — cada lado reconstrói o time do rival
// via buildPool e aplica o OVR (já com evolução) que veio no snapshot.
export interface UltimatePvpSquad {
  name: string;
  elo: number;
  chem: number; // multiplicador de química (0.8–1.2)
  cards: { pid: string; ovr: number }[];
}

// O Ultimate Team mistura cartas históricas com o elenco atual de 2026. As duas
// bases vêm do build (nunca do localStorage), então todos os clientes reconstroem
// exatamente o mesmo sorteio a partir do seed do lobby.
export function onlineDataset(pool: TournamentPool, ruleset: UltimateRuleset = 'open'): TeamSeason[] {
  let eligible = [...CS2_REAL_2026, ...BASE_TEAMS].filter((t) => t.players.length >= 5 && !t.pending && t.id !== '__free__');
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
export function buildDraftForPlayer(
  seed: number,
  pool: TournamentPool,
  nick: string,
  ruleset: UltimateRuleset = 'open',
  rollouts: number[] = [],
): OnlineDraftSetup {
  const playerSeed = (seed ^ hashStr(nick.toLowerCase())) >>> 0;
  const setup = buildDraftFromSeed(playerSeed, pool, ruleset);
  return {
    ...setup,
    sources: setup.sources.map((source, round) => {
      const rollout = Math.max(0, Math.min(5, Number(rollouts[round]) || 0));
      if (rollout === 0) return source;
      const rerolledSeed = (playerSeed ^ hashStr(`rollout-${round}-${rollout}`)) >>> 0;
      return buildDraftFromSeed(rerolledSeed, pool, ruleset).sources[0] ?? source;
    }),
  };
}

export function teamFromPicks(
  nick: string,
  picks: string[],
  coachPick: string,
  setup: OnlineDraftSetup,
  strategy?: OnlineStrategy,
  lineup?: OnlineLineup,
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
  const captain = chosen.find((c) => c.player.id === lineup?.captainId)?.player ?? chosen.find((c) => c.player.role === 'IGL')?.player ?? chosen[0].player;
  const pickedIds = new Set(chosen.map((c) => c.player.id));
  const reserveSource = setup.sources.flatMap((source) => source.players.map((player) => ({ player, source })))
    .find((candidate) => candidate.player.id === lineup?.reserveId && !pickedIds.has(candidate.player.id));
  const reserveOvr = reserveSource ? playerOvr(reserveSource.player) : 0;
  const weakestOvr = Math.min(...chosen.map((c) => playerOvr(c.player)));
  const reserveImpact = strategy?.substituteAfterMap && reserveSource ? Math.max(0, reserveOvr - weakestOvr) * 0.18 + 0.25 : 0;
  const captainImpact = Math.max(0, captain.igl - 55) / 35;
  team = {
    ...team,
    mapPrefs,
    strength: team.strength + tacticStrength - capPenalty + gauntletBonus + brWorldBonus + reserveImpact,
    teamwork: team.teamwork + tacticTeamwork + captainImpact,
    playbook: plan.pace === 'aggressive' ? 'fast' : plan.pace === 'cautious' ? 'controlled' : plan.tactic === 'balanced' ? undefined : plan.tactic,
    playbookFam: plan.tactic === 'balanced' && (!plan.pace || plan.pace === 'default') ? undefined : 0.72,
    onlinePlan: {
      captainNick: captain.nick,
      reserveNick: reserveSource?.player.nick,
      timeoutMap: plan.timeoutMap,
      pace: plan.pace ?? 'default',
      substituteAfterMap: plan.substituteAfterMap,
    },
  };
  // ids de jogador PRECISAM ser únicos no torneio: dois jogadores podem draftar
  // a mesma lenda, e stats/killfeed/MVP são indexados por id
  const players = team.players.map((p) => ({ ...p, id: `online_${nick}__${p.sourcePlayerId}` }));
  const weakestPlayer = players.reduce((weakest, player) => player.ovr < weakest.ovr ? player : weakest);
  const reservePlayer = reserveSource
    ? buildUserTeam(nick, [...chosen.slice(0, 4), { player: reserveSource.player, from: reserveSource.source }], coachTeam.coach).players[4]
    : null;
  const bench = reservePlayer
    ? [{ ...reservePlayer, id: `online_${nick}__bench_${reservePlayer.sourcePlayerId}` }]
    : undefined;
  return {
    ...team,
    id: `online_${nick}`,
    name: nick,
    isUser: false,
    players,
    bench,
    onlinePlan: {
      ...team.onlinePlan,
      substitutePlayerId: strategy?.substituteAfterMap && bench ? weakestPlayer.id : undefined,
    },
  };
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
  const ordered = state.players.filter((p) => !p.spectator).sort(byNickCodepoint).slice(0, 2);
  if (ordered.length < 2) return null;
  const ruleset = state.lobby.ruleset ?? 'open';
  const teams = ordered.map((p) => {
    const setup = buildDraftForPlayer(state.lobby.seed, state.lobby.pool, p.nick, ruleset, p.rollouts);
    return teamFromPicks(p.nick, p.picks ?? [], p.coach_pick ?? '', setup, p.strategy, p.lineup, ruleset);
  });
  if (!teams[0] || !teams[1]) return null;

  const pair = teams as [TTeam, TTeam];
  const rng = makeRng(((state.lobby.run_seed ?? state.lobby.seed) ^ 0x55544d) >>> 0);
  const maps = state.lobby.veto?.maps?.length === 3
    ? state.lobby.veto.maps.map((map, index) => ({ map, pickedBy: index < 2 ? index as 0 | 1 : -1 as const }))
    : autoVeto(pair, rng, 3);
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

function majorVetoMaps(
  tournament: Tournament,
  pairing: Pairing,
  rng: Rng,
  stage: number,
  plans: LobbyState['lobby']['major_vetos'],
) {
  const teams = [tournament.teams.find((team) => team.id === pairing.a)!, tournament.teams.find((team) => team.id === pairing.b)!] as [TTeam, TTeam];
  const bestOf = pairingBestOf(tournament, pairing);
  const saved = plans?.[majorMatchKey(stage, pairing)];
  return saved?.maps?.length === bestOf ? saved.maps : autoVeto(teams, rng, bestOf);
}

export const majorMatchKey = (stage: number, pairing: Pick<Pairing, 'a' | 'b'>) => `${stage}:${pairing.a}|${pairing.b}`;

export function simulateOnlineMajor(state: LobbyState): OnlineMajor | null {
  // ELENCO CONGELADO: se o Major já começou (run_roster gravado), simula a partir
  // DELE — não dos players ao vivo. Sem isso, alguém entrando/saindo da sala muda
  // a contagem de humanos, re-sorteia os times de IA e re-embaralha TODO o bracket,
  // invertendo resultados que já tinham sido jogados/assistidos.
  const roster: RosterEntry[] = state.lobby.run_roster && state.lobby.run_roster.length
    ? state.lobby.run_roster
    : state.players.filter((p) => !p.spectator).map((p) => ({
        nick: p.nick, picks: p.picks, coach_pick: p.coach_pick,
        strategy: p.strategy, lineup: p.lineup, rollouts: p.rollouts,
      }));
  const ordered = [...roster].sort(byNickCodepoint);
  const ruleset = state.lobby.ruleset ?? 'open';

  const humanByTeamId: Record<string, string> = {};
  const humanTeams: TTeam[] = [];
  const usedSources = new Set<string>();
  for (const p of ordered) {
    // cada jogador draftou do PRÓPRIO sorteio (seed + nick)
    const setup = buildDraftForPlayer(state.lobby.seed, state.lobby.pool, p.nick, ruleset, p.rollouts);
    const t = teamFromPicks(p.nick, p.picks ?? [], p.coach_pick ?? '', setup, p.strategy, p.lineup, ruleset);
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
  while (tournament.phase !== 'done' && guard < 40) {
    for (const pairing of tournament.pairings) {
      const plans = state.lobby.major_vetos;
      const a = tournament.teams.find((team) => team.id === pairing.a)!;
      const b = tournament.teams.find((team) => team.id === pairing.b)!;
      const bestOf = pairingBestOf(tournament, pairing);
      const seriesRng = makeRng((runSeed ^ hashStr(`${guard}|${pairing.a}|${pairing.b}`)) >>> 0);
      pairing.result = simulateSeries(seriesRng, a, b, majorVetoMaps(tournament, pairing, seriesRng, guard, plans), bestOf);
      // DESFECHO AUTORITATIVO: se o dono da partida já reportou o resultado, ele é a
      // verdade — sobrepõe vencedor/placar (mantém os mapas locais só pro replay).
      // Garante que os clientes concordem mesmo em versões diferentes do simulador.
      const reported = state.lobby.stage_results?.[`${guard}:${pairing.a}|${pairing.b}`];
      if (reported && (reported.winner === 0 || reported.winner === 1)) {
        pairing.result = { ...pairing.result, winner: reported.winner, mapScore: reported.mapScore ?? pairing.result.mapScore };
      }
    }
    resolveRound(tournament, tRng);
    guard++;
  }

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

export async function lobbyApi(body: Record<string, unknown>): Promise<{ ok?: boolean; code?: string; error?: string; stage?: number; advanced?: boolean; startedAt?: number; veto?: OnlineMajorVetoState; matched?: boolean; queued?: boolean; waiting?: number; waitedMs?: number; window?: number }> {
  const res = await fetch('/api/lobby', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(9000),
  });
  return (await res.json()) as { ok?: boolean; code?: string; error?: string; stage?: number; advanced?: boolean; startedAt?: number; veto?: OnlineMajorVetoState };
}

export interface OpenRoom { code: string; mode: 'duel' | 'party' | 'ultimate'; pool: TournamentPool; host: string; name?: string | null; players: number; max: number; ranked?: boolean; host_mmr?: number | null; }
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

// ETag por sala: mandamos If-None-Match no poll pra receber 304 quando nada mudou
// (corta a banda de origem do estado repetido). Como a resposta é no-store, o
// cache HTTP do browser não guarda — gerenciamos o ETag aqui no app.
const lobbyEtags = new Map<string, string>();

// 'gone' = a sala não existe mais (expirou/foi encerrada); 'unchanged' = 304 (sem
// mudança, mantém o estado atual); null = erro transitório.
// Só fazemos a requisição condicional quando a tela confirma que já tem um
// snapshot. O Map sobrevive a remounts; mandar o ETag com uma tela vazia faria o
// servidor responder 304 e deixaria o jogador preso no loading ao voltar à sala.
export async function fetchLobby(code: string, hasSnapshot = false): Promise<LobbyState | null | 'gone' | 'unchanged'> {
  try {
    const prev = lobbyEtags.get(code);
    const res = await fetch(`/api/lobby?code=${encodeURIComponent(code)}`, {
      headers: prev && hasSnapshot ? { 'If-None-Match': prev } : undefined,
      signal: AbortSignal.timeout(9000),
    });
    if (res.status === 304) return 'unchanged';
    if (res.status === 404) { lobbyEtags.delete(code); return 'gone'; }
    if (!res.ok) return null;
    const tag = res.headers.get('ETag');
    if (tag) lobbyEtags.set(code, tag); else lobbyEtags.delete(code);
    return (await res.json()) as LobbyState;
  } catch {
    return null;
  }
}
