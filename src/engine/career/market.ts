import type { Player, Role } from '../../types';

export interface NegotiationFilters {
  query: string;
  role: Role | '';
  country: string;
}

export type MarketSort = 'ovr-desc' | 'ovr-asc';

export function sortMarketEntries<T>(
  entries: readonly T[],
  sort: MarketSort,
  getOvr: (entry: T) => number,
  getName: (entry: T) => string,
): T[] {
  const direction = sort === 'ovr-asc' ? 1 : -1;
  return [...entries].sort((a, b) => {
    const byOvr = (getOvr(a) - getOvr(b)) * direction;
    return byOvr || getName(a).localeCompare(getName(b), undefined, { sensitivity: 'base' });
  });
}

export function isPlayerCommittedForExit(
  playerId: string,
  deals: { outPlayerIds: string[] }[],
  sales: { playerId: string }[],
): boolean {
  return deals.some((deal) => deal.outPlayerIds.includes(playerId))
    || sales.some((sale) => sale.playerId === playerId);
}

export function matchesNegotiationFilters(
  player: Pick<Player, 'nick' | 'role' | 'country'>,
  teamName: string,
  filters: NegotiationFilters,
): boolean {
  const query = filters.query.trim().toLocaleLowerCase();
  return (!query
      || player.nick.toLocaleLowerCase().includes(query)
      || teamName.toLocaleLowerCase().includes(query))
    && (!filters.role || player.role === filters.role)
    && (!filters.country || player.country === filters.country);
}
