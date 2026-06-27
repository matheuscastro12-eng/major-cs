// Liga Academy — as principais academies do mundo (identidades reais; ver
// src/data/academy-clubs.json) mais o time academy do usuário disputam um
// turno único (round-robin) por split. Simulação determinística: mesmo split +
// mesma força do usuário => mesma tabela. Não infla o save (derivado).
import clubsData from '../../data/academy-clubs.json';
import { CS2_REAL_2026 } from '../../data/bo3';

export type AcademyRole = 'Rifler' | 'Entry' | 'Support' | 'AWP' | 'IGL';

export interface AcademyClubPlayer {
  nick: string;
  name: string;
  country: string;
  role: AcademyRole;
}

export interface AcademyClub {
  id: string;
  name: string;
  tag: string;
  country: string;
  colors: [string, string];
  players?: AcademyClubPlayer[]; // roster real (parcial ou completo); resto é procedural
  parentId?: string;    // id no dataset bo3 — pra resolver logoUrl do time pai
  parentTag?: string;   // sigla do time pai (NAVI, MOUZ, etc.)
  parentName?: string;  // nome do time pai
}

export const ACADEMY_CLUBS: AcademyClub[] = (clubsData.clubs as AcademyClub[]).map((c) => ({
  ...c,
  colors: (c.colors ?? ['#101820', '#61a8dd']) as [string, string],
}));

// Map parentId → logoUrl do time pai (derivado uma vez do dataset bo3).
// Usado pelo AcademyBadge pra renderizar "logo MOUZ + ACADEMY" em vez do
// genérico "NXT" do academy isolado.
const PARENT_LOGO_MAP: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const t of CS2_REAL_2026 as Array<{ id: string; logoUrl?: string }>) {
    if (t.id && t.logoUrl) out[t.id] = t.logoUrl;
  }
  return out;
})();

/** Devolve a logoUrl do time pai do academy (ou undefined se não mapeado). */
export function academyParentLogoUrl(club: AcademyClub | { parentId?: string }): string | undefined {
  return club.parentId ? PARENT_LOGO_MAP[club.parentId] : undefined;
}

function hash(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

// força base de cada academy (62..76) — determinística pelo id, com leve viés
// para as grandes (rosters reais costumam ser mais fortes).
export function clubStrength(club: AcademyClub): number {
  const h = hash(`str:${club.id}`);
  const base = 62 + (h % 13); // 62..74
  const realBonus = club.players && club.players.length >= 4 ? 2 : 0;
  return base + realBonus;
}

export interface AcademyStanding {
  id: string;
  name: string;
  tag: string;
  colors: [string, string];
  isUser: boolean;
  strength: number;
  w: number;
  l: number;
  pts: number;
  diff: number; // saldo de mapas
  parentId?: string;
  parentTag?: string;
  parentName?: string;
}

export interface AcademyMatch {
  oppId: string;
  oppName: string;
  oppTag: string;
  oppColors: [string, string];
  userScore: number;
  oppScore: number;
  won: boolean;
  parentId?: string;
  parentTag?: string;
  parentName?: string;
}

export interface AcademyLeagueResult {
  table: AcademyStanding[];
  userMatches: AcademyMatch[];
  userPlace: number;
}

const USER_ID = 'user-academy';

// resultado determinístico de um confronto (MD3): força + ruído do seed.
function playMatch(aStr: number, bStr: number, seed: string): [number, number] {
  const noise = (hash(seed) % 21) - 10; // -10..+10
  const edge = aStr - bStr + noise;
  if (edge > 4) return [2, hash(seed + 'm') % 2]; // 2-0 ou 2-1
  if (edge < -4) return [hash(seed + 'm') % 2, 2];
  // equilibrado: decide no detalhe
  return hash(seed + 'tie') % 2 === 0 ? [2, 1] : [1, 2];
}

export function academyLeague(
  userTeam: { name: string; tag: string; colors: [string, string]; strength: number },
  splitSeed: string | number,
): AcademyLeagueResult {
  const seedBase = String(splitSeed);
  const entries: { id: string; name: string; tag: string; colors: [string, string]; isUser: boolean; strength: number; parentId?: string; parentTag?: string; parentName?: string }[] = [
    ...ACADEMY_CLUBS.map((c) => ({ id: c.id, name: c.name, tag: c.tag, colors: c.colors, isUser: false, strength: clubStrength(c), parentId: c.parentId, parentTag: c.parentTag, parentName: c.parentName })),
    { id: USER_ID, name: userTeam.name, tag: userTeam.tag, colors: userTeam.colors, isUser: true, strength: userTeam.strength },
  ];

  const stats = new Map<string, AcademyStanding>();
  for (const e of entries) {
    stats.set(e.id, { id: e.id, name: e.name, tag: e.tag, colors: e.colors, isUser: e.isUser, strength: e.strength, w: 0, l: 0, pts: 0, diff: 0, parentId: e.parentId, parentTag: e.parentTag, parentName: e.parentName });
  }
  const userMatches: AcademyMatch[] = [];

  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i];
      const b = entries[j];
      const [sa, sb] = playMatch(a.strength, b.strength, `${seedBase}:${a.id}:${b.id}`);
      const sA = stats.get(a.id)!;
      const sB = stats.get(b.id)!;
      sA.diff += sa - sb;
      sB.diff += sb - sa;
      if (sa > sb) { sA.w++; sA.pts += 3; sB.l++; } else { sB.w++; sB.pts += 3; sA.l++; }
      if (a.isUser || b.isUser) {
        const opp = a.isUser ? b : a;
        const us = a.isUser ? sa : sb;
        const them = a.isUser ? sb : sa;
        userMatches.push({
          oppId: opp.id, oppName: opp.name, oppTag: opp.tag, oppColors: opp.colors,
          userScore: us, oppScore: them, won: us > them,
          parentId: opp.parentId, parentTag: opp.parentTag, parentName: opp.parentName,
        });
      }
    }
  }

  const table = [...stats.values()].sort((x, y) => y.pts - x.pts || y.diff - x.diff || y.strength - x.strength);
  const userPlace = table.findIndex((t) => t.isUser) + 1;
  return { table, userMatches, userPlace };
}
