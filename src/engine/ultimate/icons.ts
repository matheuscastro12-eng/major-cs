// ÍCONES HISTÓRICOS — as lendas do CS competitivo como cartas do Ultimate.
// Curado à mão (nada deriva do dataset 2026: são jogadores APOSENTADOS/legado),
// espelhando os squads históricos do Diário (engine/daily/lineups.ts). Cada
// ícone pertence ao seu squad de época (teamOrigin `hist-*`) — juntar a NiP
// 2013 inteira dá química cheia, como montar o dream team de uma era.
// Puro/determinístico. NOTA: imports com extensão .js (padrão dos módulos do
// Ultimate que podem rodar no servidor — ver promos.ts).
import type { Role } from '../../types.js';
import { deriveStats, type UltCard } from './cards.js';
import type { RegionKey } from '../../data/regions.js';

export interface IconDef {
  id: string;          // playerId estável (`hist_<nick>`) — nunca colide com o dataset real
  nick: string;
  country: string;
  region: RegionKey | 'global';
  role: Role;
  role2?: Role;
  era: string;         // rótulo do squad de época — vira teamOriginName ("NiP 2013")
  eraId: string;       // teamOrigin (eixo de química): mesmo squad histórico = link
  ovr: number;         // 88-97 — curado, não deriva de nada
  // flair opcional: sobrescreve atributos crus específicos (GeT_RiGhT clutch 99…)
  flair?: Partial<{ aim: number; clutch: number; consistency: number; awp: number; igl: number }>;
}

// atributos crus padrão de um ícone: o OVR manda, a role dá o formato.
function rawAttrs(d: IconDef) {
  const o = d.ovr;
  return {
    aim: Math.min(99, d.role === 'AWP' ? o - 2 : o + 1),
    clutch: Math.min(99, o - 1),
    consistency: Math.min(99, o - 2),
    awp: Math.min(99, d.role === 'AWP' ? o + 2 : o - 15),
    igl: Math.min(99, d.role === 'IGL' ? o + 2 : o - 12),
    ...d.flair,
  };
}

const icon = (
  id: string, nick: string, country: string, region: IconDef['region'], role: Role,
  eraId: string, era: string, ovr: number, flair?: IconDef['flair'],
): IconDef => ({ id: `hist_${id}`, nick, country, region, role, eraId: `hist-${eraId}`, era, ovr, flair });

export const ICONS: IconDef[] = [
  // ── NiP 2013 — o 87-0
  icon('forest', 'f0rest', 'se', 'europe', 'Rifler', 'nip13', 'NiP 2013', 95),
  icon('getright', 'GeT_RiGhT', 'se', 'europe', 'Lurker', 'nip13', 'NiP 2013', 96, { clutch: 99 }),
  icon('friberg', 'friberg', 'se', 'europe', 'Entry', 'nip13', 'NiP 2013', 91),
  icon('xizt', 'Xizt', 'se', 'europe', 'IGL', 'nip13', 'NiP 2013', 90),
  icon('fifflaren', 'Fifflaren', 'se', 'europe', 'AWP', 'nip13', 'NiP 2013', 88),
  // ── Fnatic 2015 — o bi de Major
  icon('olof', 'olofmeister', 'se', 'europe', 'Rifler', 'fnatic15', 'Fnatic 2015', 96),
  icon('jw', 'JW', 'se', 'europe', 'AWP', 'fnatic15', 'Fnatic 2015', 93, { aim: 95 }),
  icon('flusha', 'flusha', 'se', 'europe', 'Lurker', 'fnatic15', 'Fnatic 2015', 94, { consistency: 96 }),
  icon('krimz', 'KRIMZ', 'se', 'europe', 'Support', 'fnatic15', 'Fnatic 2015', 92, { consistency: 97 }),
  icon('pronax', 'pronax', 'se', 'europe', 'IGL', 'fnatic15', 'Fnatic 2015', 90),
  // ── Virtus.pro 2014 — o Golden Five
  icon('neo', 'NEO', 'pl', 'europe', 'Rifler', 'vp14', 'Virtus.pro 2014', 95, { consistency: 97 }),
  icon('pasha', 'pashaBiceps', 'pl', 'europe', 'Entry', 'vp14', 'Virtus.pro 2014', 93),
  icon('taz', 'TaZ', 'pl', 'europe', 'IGL', 'vp14', 'Virtus.pro 2014', 91),
  icon('snax', 'Snax', 'pl', 'europe', 'Lurker', 'vp14', 'Virtus.pro 2014', 94, { clutch: 97 }),
  icon('byali', 'byali', 'pl', 'europe', 'Rifler', 'vp14', 'Virtus.pro 2014', 90),
  // ── SK 2016/17 — a era brasileira
  icon('coldzera', 'coldzera', 'br', 'samerica', 'Rifler', 'sk16', 'SK Gaming 2016', 96, { consistency: 98 }),
  icon('fer', 'fer', 'br', 'samerica', 'Entry', 'sk16', 'SK Gaming 2016', 94),
  icon('fnx', 'fnx', 'br', 'samerica', 'Support', 'sk16', 'SK Gaming 2016', 92, { clutch: 95 }),
  icon('taco', 'TACO', 'br', 'samerica', 'Support', 'sk16', 'SK Gaming 2016', 90),
  icon('felps', 'felps', 'br', 'samerica', 'Entry', 'sk16', 'SK Gaming 2016', 91),
  // ── mibr 1.6 — a raiz
  icon('cogu', 'cogu', 'br', 'samerica', 'Rifler', 'mibr06', 'mibr 2006', 93, { clutch: 96 }),
  // ── Astralis — a dinastia dinamarquesa
  icon('dupreeh', 'dupreeh', 'dk', 'europe', 'Entry', 'astralis18', 'Astralis 2018', 94),
  icon('xyp9x', 'Xyp9x', 'dk', 'europe', 'Support', 'astralis18', 'Astralis 2018', 92, { clutch: 99 }),
  icon('gla1ve', 'gla1ve', 'dk', 'europe', 'IGL', 'astralis18', 'Astralis 2018', 93),
  // ── França — Titans/EnVyUs/G2
  icon('kennys', 'kennyS', 'fr', 'europe', 'AWP', 'fr-era', 'Era Francesa', 96, { awp: 99 }),
  icon('shox', 'shox', 'fr', 'europe', 'Rifler', 'fr-era', 'Era Francesa', 94, { clutch: 96 }),
  icon('scream', 'ScreaM', 'be', 'europe', 'Entry', 'fr-era', 'Era Francesa', 93, { aim: 99 }),
  icon('happy', 'Happy', 'fr', 'europe', 'IGL', 'fr-era', 'Era Francesa', 91),
  // ── CIS — Na'Vi/Gambit clássicos
  icon('guardian', 'GuardiaN', 'sk', 'cis', 'AWP', 'cis-era', 'Lendas da CIS', 94, { awp: 97 }),
  icon('markeloff', 'markeloff', 'ua', 'cis', 'AWP', 'cis-era', 'Lendas da CIS', 93),
  icon('edward', 'Edward', 'ua', 'cis', 'Rifler', 'cis-era', 'Lendas da CIS', 91),
  icon('zeus', 'Zeus', 'ua', 'cis', 'IGL', 'cis-era', 'Lendas da CIS', 92, { igl: 97 }),
  icon('dosia', 'Dosia', 'ru', 'cis', 'Support', 'cis-era', 'Lendas da CIS', 90),
];

// eras COMPLETÁVEIS (4+ integrantes — cogu solo não conta como "era completa")
// e contagem de eras que o jogador fechou. Alimenta os objetivos de coleção.
export interface IconEra { eraId: string; era: string; size: number; playerIds: string[] }

export function iconEras(): IconEra[] {
  const by = new Map<string, IconEra>();
  for (const d of ICONS) {
    const e = by.get(d.eraId) ?? { eraId: d.eraId, era: d.era, size: 0, playerIds: [] };
    e.size += 1;
    e.playerIds.push(d.id);
    by.set(d.eraId, e);
  }
  return [...by.values()].filter((e) => e.size >= 4);
}

export function countCompletedEras(ownedPlayerIds: Set<string>): number {
  return iconEras().filter((e) => e.playerIds.every((id) => ownedPlayerIds.has(id))).length;
}

// as cartas prontas pro catálogo — key `${id}:histIcon` (estável pra sempre).
export function iconCards(): UltCard[] {
  return ICONS.map((d) => ({
    key: `${d.id}:histIcon`,
    playerId: d.id,
    nick: d.nick,
    country: d.country,
    region: d.region,
    role: d.role,
    teamOrigin: d.eraId,
    teamOriginName: d.era,
    rarity: 'histIcon' as const,
    ovr: d.ovr,
    stats: deriveStats({ ...rawAttrs(d), role: d.role, role2: d.role2 }),
  }));
}
