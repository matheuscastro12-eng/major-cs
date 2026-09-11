// Elegibilidade de abertura é diferente do catálogo de propriedade: cartas
// antigas continuam indexáveis, mas não ocupam a garantia da oferta vigente.
import type { UltCard } from './cards.js';
import { BASE_RARITY_ORDER } from './rarities.js';
import { totwForWeek, weekIndex } from './totw.js';

export function weeklyPackPool(catalog: UltCard[], now: Date): UltCard[] | null {
  const week = weekIndex(now);
  if (week < 0) return null;
  const base = catalog.filter((c) => BASE_RARITY_ORDER.includes(c.rarity));
  const ids = new Set(totwForWeek(base, week).playerIds);
  const available = new Set(catalog.filter((c) => c.rarity === 'totw').map((c) => c.playerId));
  // Snapshot vencido/incompleto: nunca trocar silenciosamente a garantia.
  if (!ids.size || [...ids].some((id) => !available.has(id))) return null;
  return catalog.filter((c) => c.rarity !== 'totw' || ids.has(c.playerId));
}
