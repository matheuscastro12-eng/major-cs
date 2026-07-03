// RTP "mundo real" — ponte com o dataset da Carreira. Em vez de times/jogadores
// procedurais, o Road to Pro usa os times REAIS (CS2_REAL_2026, do bo3.gg) e as
// academias reais (academy-clubs), indexados por (região, tier). O tier sai do
// `teamwork` do time (mesma lógica da carreira): ≥82 elite, ≥77 challenger,
// senão access. Academia é o degrau abaixo (clubes juniores reais).
//
// Escada: academy → access → challenger → elite (→ Major, futuro).

import { CS2_REAL_2026 } from '../../data/bo3';
import { ACADEMY_CLUBS, academyParentLogoUrl } from '../career/academyLeague';
import { buildAcademyOpponentTeam } from '../career/academyMatch';
import { macroRegionOf, macroRegionPlurality, MACRO_REGION_LABELS, type MacroRegion } from '../../data/regions';
import { derivePlaystyle, type Player, type TeamSeason, type TPlayer, type Role } from '../../types';
import { makeRng, shuffle } from '../rng';
import { hashStr } from '../../state/hash';
import type { Tier } from './types';

export { MACRO_REGION_LABELS, type MacroRegion };

// Time do mundo unificado (real ou academia), pronto pro engine.
export interface WorldTeam {
  id: string;
  name: string;
  tag: string;
  colors: [string, string];
  logoUrl?: string;
  country: string;
  tier: Tier;
  region: MacroRegion;
  strength: number;        // OVR médio do elenco
  players: TPlayer[];      // 5 TPlayers (reais; academia tem stats gerados)
  source: 'real' | 'academy';
}

// ─────────────────────────────────────────────────────────────────────────────
// Classificação

function realTier(teamwork: number): Tier {
  if (teamwork >= 82) return 'elite';
  if (teamwork >= 77) return 'challenger';
  return 'access';
}

function ovrOf(p: Pick<Player, 'aim' | 'consistency' | 'clutch' | 'awp' | 'igl'>): number {
  const spec = Math.max(p.awp, p.igl, p.aim);
  return Math.round(p.aim * 0.45 + p.consistency * 0.18 + p.clutch * 0.12 + spec * 0.25);
}

function realToTPlayer(p: Player, runtimeId: string): TPlayer {
  return {
    id: runtimeId, sourcePlayerId: p.id, nick: p.nick, name: p.name, country: p.country,
    role: p.role, role2: p.role2, playstyle: p.playstyle ?? derivePlaystyle(p.role),
    aim: p.aim, clutch: p.clutch, consistency: p.consistency, awp: p.awp, igl: p.igl,
    skill: p.aim * 0.6 + p.consistency * 0.25 + p.clutch * 0.15, ovr: ovrOf(p), form: 1,
  };
}

function realTeamToWorld(t: TeamSeason): WorldTeam {
  const top5 = t.players.slice(0, 5);
  const players = top5.map((p, i) => realToTPlayer(p, `${t.id}__p${i}`));
  const strength = players.length ? Math.round(players.reduce((a, p) => a + p.ovr, 0) / players.length) : t.teamwork;
  return {
    id: t.id, name: t.team, tag: t.tag, colors: t.colors, logoUrl: t.logoUrl, country: t.country,
    tier: realTier(t.teamwork ?? 70), region: macroRegionPlurality(top5.map((p) => p.country)),
    strength, players, source: 'real',
  };
}

function academyToWorld(clubId: string, season: number): WorldTeam | null {
  const club = ACADEMY_CLUBS.find((c) => c.id === clubId);
  if (!club) return null;
  const tt = buildAcademyOpponentTeam(club, season); // gera stats a partir da força
  return {
    id: club.id, name: club.name, tag: club.tag, colors: club.colors,
    logoUrl: academyParentLogoUrl(club), country: club.country,
    tier: 'academy', region: macroRegionPlurality(tt.players.map((p) => p.country)) ?? (macroRegionOf(club.country) ?? 'europe'),
    strength: tt.strength, players: tt.players, source: 'academy',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Catálogo (computado uma vez) — times reais por (região, tier)

const REAL_BY_RT: Map<string, WorldTeam[]> = (() => {
  const m = new Map<string, WorldTeam[]>();
  for (const t of CS2_REAL_2026) {
    const w = realTeamToWorld(t);
    const k = `${w.region}:${w.tier}`;
    (m.get(k) ?? m.set(k, []).get(k)!).push(w);
  }
  return m;
})();

const ACADEMY_BY_REGION: Map<MacroRegion, string[]> = (() => {
  const m = new Map<MacroRegion, string[]>();
  for (const c of ACADEMY_CLUBS) {
    const r = macroRegionOf(c.country) ?? 'europe';
    (m.get(r) ?? m.set(r, []).get(r)!).push(c.id);
  }
  return m;
})();

export const TIER_ORDER: Tier[] = ['academy', 'access', 'challenger', 'elite'];

// Tier mais baixo jogável da região: academia se houver clubes; senão access.
export function lowestTierForRegion(region: MacroRegion): Tier {
  if ((ACADEMY_BY_REGION.get(region)?.length ?? 0) >= 2) return 'academy';
  return 'access';
}

export function regionOfCountry(country: string): MacroRegion {
  return macroRegionOf(country) ?? 'europe';
}

// ─────────────────────────────────────────────────────────────────────────────
// Pool de uma divisão (região, tier) — determinístico por (região, tier, season)

// Devolve até `size` WorldTeams da (região, tier). Se o pool for fino, completa
// com tiers/regiões vizinhas pra sempre fechar uma divisão jogável.
export function divisionPool(region: MacroRegion, tier: Tier, season: number, size = 8): WorldTeam[] {
  const rng = makeRng(hashStr(`div:${region}:${tier}:${season}`) >>> 0);

  let pool: WorldTeam[];
  if (tier === 'academy') {
    const ids = ACADEMY_BY_REGION.get(region) ?? [];
    pool = ids.map((id) => academyToWorld(id, season)).filter((w): w is WorldTeam => !!w);
  } else {
    pool = [...(REAL_BY_RT.get(`${region}:${tier}`) ?? [])];
  }

  // completa pools finos: mesmo tier em outras regiões, depois tiers vizinhos.
  if (pool.length < size && tier !== 'academy') {
    const seen = new Set(pool.map((t) => t.id));
    const add = (extra: WorldTeam[]) => { for (const t of extra) { if (pool.length >= size + 4) break; if (!seen.has(t.id)) { seen.add(t.id); pool.push(t); } } };
    for (const [k, ts] of REAL_BY_RT) if (k.endsWith(`:${tier}`)) add(ts);             // mesmo tier, qualquer região
    const adj: Tier[] = tier === 'access' ? ['challenger'] : tier === 'challenger' ? ['access', 'elite'] : ['challenger'];
    for (const at of adj) add(REAL_BY_RT.get(`${region}:${at}`) ?? []);                // tier vizinho, mesma região
  }

  return shuffle(rng, pool).slice(0, Math.max(4, Math.min(size, pool.length)));
}

// ─────────────────────────────────────────────────────────────────────────────
// Time inicial + entrar num time

// Escolhe um time real da região no tier mais baixo (o mais fraco do pool — você
// é uma promessa entrando por baixo). Devolve o time + região + tier.
export function startTeam(country: string, seed: number): { team: WorldTeam; region: MacroRegion; tier: Tier } {
  const region = regionOfCountry(country);
  const tier = lowestTierForRegion(region);
  const pool = divisionPool(region, tier, 1, 12);
  const rng = makeRng((seed ^ 0xa11ce) >>> 0);
  // entre os mais fracos do pool (ordena por força, pega aleatório do terço de baixo)
  const sorted = [...pool].sort((a, b) => a.strength - b.strength);
  const bottom = sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 3)));
  const team = bottom[Math.floor(rng() * bottom.length)] ?? sorted[0];
  return { team, region, tier };
}

// Time inicial num TIER ALVO (definido pela peneira). `strong` (peneira boa) puxa
// do terço FORTE do pool do tier; senão, do terço fraco (entra por baixo). Se a
// região não tiver time no tier pedido, desce um tier até achar pool jogável, pra
// o placement nunca quebrar. Determinístico por seed.
export function startTeamForTier(
  country: string,
  seed: number,
  tier: Tier,
  strong: boolean,
): { team: WorldTeam; region: MacroRegion; tier: Tier } {
  const region = regionOfCountry(country);
  let t = tier;
  let pool = divisionPool(region, t, 1, 12);
  while (pool.length === 0 && TIER_ORDER.indexOf(t) > 0) {
    t = TIER_ORDER[TIER_ORDER.indexOf(t) - 1];
    pool = divisionPool(region, t, 1, 12);
  }
  if (pool.length === 0) return startTeam(country, seed); // fallback duro
  const rng = makeRng((seed ^ 0xa11ce) >>> 0);
  const sorted = [...pool].sort((a, b) => a.strength - b.strength);
  const third = Math.max(1, Math.ceil(sorted.length / 3));
  const band = strong ? sorted.slice(-third) : sorted.slice(0, third);
  const team = band[Math.floor(rng() * band.length)] ?? sorted[0];
  return { team, region, tier: t };
}

// Você assume a vaga de um jogador no time: substitui quem joga na sua função
// (ou o mais fraco). Devolve os 4 COLEGAS reais restantes.
export function joinTeam(team: WorldTeam, heroRole: Role): TPlayer[] {
  const players = [...team.players];
  let dropIdx = players.findIndex((p) => p.role === heroRole);
  if (dropIdx < 0) {
    // ninguém na sua função → tira o de menor OVR
    dropIdx = players.reduce((min, p, i, arr) => (p.ovr < arr[min].ovr ? i : min), 0);
  }
  return players.filter((_, i) => i !== dropIdx).slice(0, 4);
}

// TODOS os clubes de academia (de todas as regiões) como WorldTeam. O pool de
// academia por região é pequeno, então o circuito academy puxa daqui pra ficar
// 100% academy (sem misturar times profissionais).
export function allAcademyTeams(season: number): WorldTeam[] {
  return ACADEMY_CLUBS
    .map((c) => academyToWorld(c.id, season))
    .filter((w): w is WorldTeam => !!w);
}

// Helper: a WorldTeam de um id (real ou academia), pra resolver adversários.
export function worldTeamById(id: string, season: number): WorldTeam | null {
  const real = CS2_REAL_2026.find((t) => t.id === id);
  if (real) return realTeamToWorld(real);
  return academyToWorld(id, season);
}
