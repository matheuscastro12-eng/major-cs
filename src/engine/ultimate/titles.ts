// Ultimate Squad — títulos (cosméticos desbloqueáveis por conquista ABSOLUTA,
// não por ranking global — é single-player). Puro. Ver docs-but-map.md §4.

export interface TitleDef {
  slug: string;
  label: string;
  desc: string;
  tier: 1 | 2 | 3 | 4 | 5;
  color: string;
}

export const TITLES: TitleDef[] = [
  { slug: 'rookie', label: 'Recruta', desc: 'Complete o onboarding.', tier: 1, color: '#8fd86f' },
  { slug: 'first-win', label: 'Estreante Vitorioso', desc: 'Vença sua 1ª ranqueada.', tier: 1, color: '#6fc3df' },
  { slug: 'collector', label: 'Colecionador', desc: 'Tenha 25 cartas únicas.', tier: 2, color: '#e8c170' },
  { slug: 'streaker', label: 'Embalado', desc: '5 vitórias seguidas.', tier: 3, color: '#c792ea' },
  { slug: 'veteran', label: 'Veterano', desc: '25 vitórias na ranqueada.', tier: 3, color: '#e8a93b' },
  { slug: 'elite', label: 'Elite', desc: 'Chegue ao topo do ranking.', tier: 4, color: '#f3cf6b' },
  { slug: 'icon-owner', label: 'Dono de Ícone', desc: 'Possua uma carta Ícone.', tier: 5, color: '#f3cf6b' },
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
}

// slugs que o estado JÁ satisfaz (união com o que já tem é feita no reducer).
export function evaluateTitles(f: TitleFacts): string[] {
  const out: string[] = [];
  if (f.onboarded) out.push('rookie');
  if (f.wins >= 1) out.push('first-win');
  if (f.uniqueCards >= 25) out.push('collector');
  if (f.streak >= 5) out.push('streaker');
  if (f.wins >= 25) out.push('veteran');
  if (f.peakElo >= 2200) out.push('elite'); // topo do ONLINE_RANKS (Global Elite)
  if (f.iconsOwned >= 1) out.push('icon-owner');
  return out;
}
