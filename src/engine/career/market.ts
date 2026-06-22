import type { Player, Role } from '../../types';

export interface NegotiationFilters {
  query: string;
  role: Role | '';
  country: string;
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
