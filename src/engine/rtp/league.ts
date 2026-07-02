// RTP4 — divisão / liga. Uma temporada é um turno-returno (double round-robin)
// de uma divisão de 8 times (você + 7 rivais com roster estável). A cada rodada
// você joga 1 partida; as outras 3 são auto-simuladas e a tabela evolui. No fim
// da temporada: promoção (top 2) / rebaixamento (bottom 2) e regenera a divisão.

import { type Rng } from '../rng';
import type { LeagueState, LeagueTeam, Standing, Fixture, Tier, RoadToProSave } from './types';
import { proToTPlayer } from './coreStats';
import { divisionPool, type WorldTeam } from './world';
import type { MacroRegion } from '../../data/regions';
import { academyEventName, t3RegionalEventName, t2EventName, t1EventName, type EventRegion } from '../../data/tournaments';

export const DIVISION_SIZE = 8;

export const TIER_ORDER: Tier[] = ['academy', 'access', 'challenger', 'elite'];
// "força base" representativa do tier (usada só por transferências/UI; o sim usa
// os stats reais dos jogadores).
export const TIER_BASE: Record<Tier, number> = { academy: 66, access: 72, challenger: 78, elite: 85 };
// Rótulo do CIRCUITO (não do campeonato). Os campeonatos têm nomes reais — ver
// circuitEventName. Aqui fica só o degrau da escada.
export const TIER_NAME: Record<Tier, string> = {
  academy: 'Academia', access: 'Acesso · T3', challenger: 'Challenger · T2', elite: 'Elite · T1',
};

function macroToEventRegion(r: MacroRegion): EventRegion {
  return r === 'americas' ? 'sa' : r === 'europe' || r === 'cis' ? 'eu' : r === 'asia' || r === 'oceania' ? 'asia' : 'global';
}

// Nome REAL do campeonato do tier/região/temporada/etapa (usa a database de
// campeonatos compartilhada com a Carreira). Ex.: access(SA) → "CCT South America".
export function circuitEventName(tier: Tier, region: MacroRegion, season: number, event = 1): string {
  switch (tier) {
    case 'elite': return t1EventName(season, event);
    case 'challenger': return t2EventName(season, event);
    case 'access': return t3RegionalEventName(season, event, macroToEventRegion(region));
    default: return academyEventName(season, event);
  }
}

export function tierUp(t: Tier): Tier {
  const i = TIER_ORDER.indexOf(t);
  return TIER_ORDER[Math.min(TIER_ORDER.length - 1, i + 1)];
}
export function tierDown(t: Tier): Tier {
  const i = TIER_ORDER.indexOf(t);
  return TIER_ORDER[Math.max(0, i - 1)];
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ─────────────────────────────────────────────────────────────────────────────
// Conversão WorldTeam (real) → LeagueTeam (snapshot na liga)

function worldToLeagueTeam(w: WorldTeam): LeagueTeam {
  return {
    id: w.id, name: w.name, tag: w.tag, colors: w.colors, logoUrl: w.logoUrl, country: w.country,
    strength: w.strength, players: w.players, isUser: false,
  };
}

// Time do usuário: identidade do time real que ele assumiu, com VOCÊ no elenco
// (protagonista + 4 colegas reais). id fixo 'rtp-user' pra tabela/calendário.
function userLeagueTeam(save: RoadToProSave): LeagueTeam {
  const hero = proToTPlayer(save.player, 'rtp-hero');
  const players = [hero, ...save.team.teammates];
  return {
    id: 'rtp-user', name: save.team.teamName, tag: save.team.tag, colors: save.team.colors,
    logoUrl: save.team.logo, country: save.player.country,
    strength: Math.round(players.reduce((a, p) => a + p.ovr, 0) / players.length),
    players, isUser: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Calendário (circle method) — turno e returno

function roundRobin(ids: string[]): Fixture[] {
  const n = ids.length;            // par
  const half = n / 2;
  const fixed = ids[0];
  let rot = ids.slice(1);
  const out: Fixture[] = [];
  // turno
  for (let r = 0; r < n - 1; r++) {
    const day = [fixed, ...rot];
    for (let i = 0; i < half; i++) {
      out.push({ round: r + 1, aId: day[i], bId: day[n - 1 - i] });
    }
    rot = [rot[rot.length - 1], ...rot.slice(0, rot.length - 1)];
  }
  // returno (mando invertido, rodadas deslocadas)
  const legLen = n - 1;
  const second = out.map((f) => ({ round: f.round + legLen, aId: f.bId, bId: f.aId }));
  return [...out, ...second];
}

// ─────────────────────────────────────────────────────────────────────────────
// Construção da liga

export function buildLeague(save: RoadToProSave, tier: Tier, seed: number): LeagueState {
  const user = userLeagueTeam(save);
  const region = save.world.region;

  // Divisão = times REAIS da (região, tier), excluindo o time que VOCÊ assumiu
  // (você é ele agora). Pega até DIVISION_SIZE-1 rivais.
  const pool = divisionPool(region, tier, save.world.season, DIVISION_SIZE + 2)
    .filter((w) => w.id !== save.team.realTeamId);
  let rivals = pool.slice(0, DIVISION_SIZE - 1).map(worldToLeagueTeam);

  // calendário (circle method) exige número PAR de times.
  let teams = [user, ...rivals];
  if (teams.length % 2 === 1) { rivals = rivals.slice(0, rivals.length - 1); teams = [user, ...rivals]; }
  // mínimo de 4 pra uma liga decente (pools muito finos já vêm completados no world).
  void seed;

  const schedule = roundRobin(teams.map((t) => t.id));
  const standings: Standing[] = teams.map((t) => ({ teamId: t.id, w: 0, l: 0, rd: 0, pts: 0 }));
  return { tier, teams, standings, schedule, round: 1, totalRounds: 2 * (teams.length - 1) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Acesso / consultas

export function teamById(league: LeagueState, id: string): LeagueTeam | undefined {
  return league.teams.find((t) => t.id === id);
}

// Fixture do usuário na rodada atual → o time adversário.
export function userOpponent(league: LeagueState): LeagueTeam | null {
  const fx = league.schedule.find((f) => f.round === league.round && (f.aId === 'rtp-user' || f.bId === 'rtp-user'));
  if (!fx) return null;
  const oppId = fx.aId === 'rtp-user' ? fx.bId : fx.aId;
  return teamById(league, oppId) ?? null;
}

export function sortedStandings(league: LeagueState): Standing[] {
  return [...league.standings].sort((a, b) => b.pts - a.pts || b.rd - a.rd || b.w - a.w);
}

export function userPlacement(league: LeagueState): number {
  return sortedStandings(league).findIndex((s) => s.teamId === 'rtp-user') + 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// Simulação leve de uma partida entre dois times (BO3 por força + ruído)

export function simFixture(a: LeagueTeam, b: LeagueTeam, rng: Rng): { aMaps: number; bMaps: number } {
  const edge = (a.strength - b.strength) / 100 + (rng() - 0.5) * 0.45;
  const pa = clamp(0.5 + edge, 0.15, 0.85);
  let aw = 0, bw = 0;
  while (aw < 2 && bw < 2) { if (rng() < pa) aw++; else bw++; }
  return { aMaps: aw, bMaps: bw };
}

function applyResult(standings: Standing[], aId: string, bId: string, aMaps: number, bMaps: number): void {
  const A = standings.find((s) => s.teamId === aId);
  const B = standings.find((s) => s.teamId === bId);
  if (!A || !B) return;
  const aWon = aMaps > bMaps;
  A.w += aWon ? 1 : 0; A.l += aWon ? 0 : 1; A.pts += aWon ? 3 : 0; A.rd += aMaps - bMaps;
  B.w += aWon ? 0 : 1; B.l += aWon ? 1 : 0; B.pts += aWon ? 0 : 3; B.rd += bMaps - aMaps;
}

// Registra o resultado da SUA partida + auto-sim das outras da rodada. Devolve
// um novo LeagueState (imutável) com standings e fixtures atualizados.
export function recordRound(
  league: LeagueState,
  userMaps: [number, number],   // [seus mapas, mapas do oponente]
  rng: Rng,
): LeagueState {
  const standings = league.standings.map((s) => ({ ...s }));
  const schedule = league.schedule.map((f) => ({ ...f }));
  const roundFixtures = schedule.filter((f) => f.round === league.round);

  for (const fx of roundFixtures) {
    if (fx.result) continue;
    const userIsA = fx.aId === 'rtp-user';
    const userIsB = fx.bId === 'rtp-user';
    if (userIsA || userIsB) {
      const aMaps = userIsA ? userMaps[0] : userMaps[1];
      const bMaps = userIsA ? userMaps[1] : userMaps[0];
      fx.result = { aMaps, bMaps };
      applyResult(standings, fx.aId, fx.bId, aMaps, bMaps);
    } else {
      const a = teamById(league, fx.aId)!;
      const b = teamById(league, fx.bId)!;
      const r = simFixture(a, b, rng);
      fx.result = { aMaps: r.aMaps, bMaps: r.bMaps };
      applyResult(standings, fx.aId, fx.bId, r.aMaps, r.bMaps);
    }
  }

  return { ...league, standings, schedule };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fim de temporada

export interface SeasonEndResult {
  placement: number;
  promoted: boolean;
  relegated: boolean;
  oldTier: Tier;
  newTier: Tier;
  champion: boolean;
  award?: 'mvp' | 'evp' | null;   // RTP v13 — prêmio individual do campeonato final
  eventRating?: number;
  worldRank?: number;
  worldRankDelta?: number;
  sacked?: boolean;               // RTP v14 — cortado no fechamento do ano (berlinda)
  newTeamName?: string;
}

export function evaluateSeasonEnd(league: LeagueState): SeasonEndResult {
  const placement = userPlacement(league);
  const oldTier = league.tier;
  let newTier = oldTier;
  let promoted = false, relegated = false;
  if (placement <= 2 && oldTier !== 'elite') { newTier = tierUp(oldTier); promoted = true; }
  else if (placement >= DIVISION_SIZE - 1 && oldTier !== 'academy') { newTier = tierDown(oldTier); relegated = true; }
  const champion = placement === 1 && oldTier === 'elite';
  return { placement, promoted, relegated, oldTier, newTier, champion };
}

// Função no elenco derivada da colocação (estrela → reserva).
export function squadRoleFor(placement: number): RoadToProSave['team']['squadRole'] {
  if (placement <= 2) return 'star';
  if (placement <= 4) return 'starter';
  if (placement <= 6) return 'rotation';
  return 'bench';
}
