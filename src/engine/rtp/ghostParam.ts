// Desafio de fantasma (?desafio=day-rating-nick): o tipo e o parser do link.
// Módulo leve de propósito: state/ghost.ts lê o parâmetro no boot do app, e o
// dailySeries.ts (que puxa o motor do Road to Pro e a base de jogadores) só
// carrega quando a Série do Dia abre.

export interface GhostChallenge {
  day: number;
  nick: string;
  rating: number;   // 2 casas, faixa real do motor (0..2.5)
}

export function parseGhostParam(raw: string | null | undefined): GhostChallenge | null {
  if (!raw) return null;
  const m = /^(\d{1,5})-(\d{1,3})-([a-z0-9_]{1,20})$/.exec(raw.trim());
  if (!m) return null;
  const day = Number(m[1]);
  const rating = Number(m[2]) / 100;
  if (day < 1 || !(rating >= 0 && rating <= 2.5)) return null;
  return { day, nick: m[3], rating };
}
