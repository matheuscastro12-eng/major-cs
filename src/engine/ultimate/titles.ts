// Ultimate Squad — títulos (cosméticos desbloqueáveis por conquista ABSOLUTA,
// não por ranking global — é single-player). Puro. Ver docs-but-map.md §4.

import { iconEras } from './icons';

export interface TitleDef {
  slug: string;
  label: string;
  desc: string;
  tier: 1 | 2 | 3 | 4 | 5;
  color: string;
}

// títulos de ERA — um por squad de época completável (icons.ts). O rótulo é a
// LORE da era (o flex é dizer "eu montei aquele time"), não o nome do time.
const ERA_TITLE_LABEL: Record<string, string> = {
  'hist-nip13': 'Herdeiro do 87-0',
  'hist-fnatic15': 'Bi de Major',
  'hist-vp14': 'Golden Five',
  'hist-sk16': 'Era Brasileira',
  'hist-astralis18': 'Dinastia',
  'hist-fr-era': 'La Casa Blanche',
  'hist-cis-era': 'Muralha do Leste',
};

export const ERA_TITLES: TitleDef[] = iconEras().map((e) => ({
  slug: `era-${e.eraId}`,
  label: ERA_TITLE_LABEL[e.eraId] ?? e.era,
  desc: `Complete as ${e.size} lendas de ${e.era}.`,
  tier: 5,
  color: '#ffd700',
}));

export const TITLES: TitleDef[] = [
  { slug: 'rookie', label: 'Recruta', desc: 'Complete o onboarding.', tier: 1, color: '#8fd86f' },
  { slug: 'first-win', label: 'Estreante Vitorioso', desc: 'Vença sua 1ª ranqueada.', tier: 1, color: '#6fc3df' },
  { slug: 'collector', label: 'Colecionador', desc: 'Tenha 25 cartas únicas.', tier: 2, color: '#e8c170' },
  { slug: 'streaker', label: 'Embalado', desc: '5 vitórias seguidas.', tier: 3, color: '#c792ea' },
  { slug: 'veteran', label: 'Veterano', desc: '25 vitórias na ranqueada.', tier: 3, color: '#e8a93b' },
  { slug: 'elite', label: 'Elite', desc: 'Chegue ao topo do ranking.', tier: 4, color: '#f3cf6b' },
  { slug: 'icon-owner', label: 'Dono de Ícone', desc: 'Possua uma carta Ícone.', tier: 5, color: '#f3cf6b' },
  ...ERA_TITLES,
  { slug: 'pantheon-curator', label: 'Curador do Panteão', desc: 'Complete TODOS os squads de época.', tier: 5, color: '#ffd700' },
];

export function titleBySlug(slug: string): TitleDef | undefined {
  return TITLES.find((t) => t.slug === slug);
}

// fatos do save necessários pra avaliar quais títulos foram conquistados.
export interface TitleFacts {
  wins: number;
  peakElo: number;
  streak: number;     // sequência atual (título persiste depois que ganho)
  uniqueCards: number;
  iconsOwned: number;
  onboarded: boolean;
  /** eraIds de squads de época COMPLETOS (icons.ts/completedEraIds). Opcional
   *  por compat — chamador antigo sem o fato só não avalia os títulos de era. */
  completedEraIds?: string[];
}

// slugs que o estado JÁ satisfaz (união com o que já tem é feita no reducer).
export function evaluateTitles(f: TitleFacts): string[] {
  const out: string[] = [];
  if (f.onboarded) out.push('rookie');
  if (f.wins >= 1) out.push('first-win');
  if (f.uniqueCards >= 25) out.push('collector');
  if (f.streak >= 5) out.push('streaker');
  if (f.wins >= 25) out.push('veteran');
  if (f.peakElo >= 1950) out.push('elite'); // piso da divisão Elite (topo do Ultimate, divisions.ts) — o 2200 antigo era do ONLINE_RANKS e deixava o título INATINGÍVEL
  if (f.iconsOwned >= 1) out.push('icon-owner');
  const eras = f.completedEraIds ?? [];
  for (const id of eras) if (ERA_TITLES.some((t) => t.slug === `era-${id}`)) out.push(`era-${id}`);
  if (eras.length >= ERA_TITLES.length && ERA_TITLES.length > 0) out.push('pantheon-curator');
  return out;
}
