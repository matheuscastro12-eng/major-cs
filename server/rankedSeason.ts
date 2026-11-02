// [F2] Régua da ranqueada compartilhada entre api/ranking.ts (report legado) e
// server/ult-match.ts (resultado do servidor): temporada mensal e K do MMR.
export const PLACEMENT_GAMES = 5;
export const K_WIN = 25;
export const K_LOSS = 20;
export const K_PLACE = 40;
export const RANKED_K = { placementGames: PLACEMENT_GAMES, kWin: K_WIN, kLoss: K_LOSS, kPlace: K_PLACE };

// temporada = mês. Número 1-indexado a partir de jan/2026 (Temporada 6 = jun/2026).
export function seasonNow(d = new Date()) {
  const no = (d.getUTCFullYear() - 2026) * 12 + (d.getUTCMonth() + 1);
  const endsAt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString();
  const startsAt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
  return { no, endsAt, startsAt };
}
export const rankedSeasonNo = (d = new Date()) => seasonNow(d).no;
