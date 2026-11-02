// Ultimate Squad — derivação COMPLETA do catálogo (base + specials curadas).
// Extraído do ensureCatalog de src/state/ultimate.ts pra que cliente E servidor
// (server/ultimate-pack.ts, fase 2 da economia server-authoritative) montem o
// MESMO catálogo a partir do mesmo dataset — sem fork das regras/odds.
// Puro/determinístico: mesma (dataset, monthIndex) ⇒ mesmo catálogo.
import type { TeamSeason } from '../../types';
import { appendSpecials, buildCatalog, type SpecialSpec, type UltCard } from './cards';
import { iconCards } from './icons';
import { promoSpecsThrough, PROMO_BOOST } from './promos';
import { totwSpecsThroughMonth, TOTW_BOOST } from './totw';
import { LEGACY_SPECIALS } from './legacySpecials';

export const TOTS_SIZE = 11;
export const TOTS_BOOST = 2;
export const MAJOR_BOOST = 3;

// TOTS: os 11 maiores OVR do catálogo base ganham versão "Time da Temporada".
export function totsSpecs(base: UltCard[]): SpecialSpec[] {
  return [...base]
    .sort((a, b) => b.ovr - a.ovr)
    .slice(0, TOTS_SIZE)
    .map((c) => ({ playerId: c.playerId, rarity: 'tots' as const, ovrBoost: TOTS_BOOST }));
}

// MAJOR: o quinteto do time #1 do dataset (proxy curado de campeão de Major).
export function majorSpecs(dataset: TeamSeason[]): SpecialSpec[] {
  return (dataset[0]?.players ?? [])
    .map((p) => ({ playerId: p.id, rarity: 'major' as const, ovrBoost: MAJOR_BOOST }));
}

// Catálogo completo do mês `mi` (monthIndex): base + tots + major + promos de
// todos os meses desde a época + in-forms TOTW das semanas que começam até o
// fim do mês + ícones históricos (standalone: playerIds fora do dataset).
// Devolve também a base (o chamador costuma precisar dela pra promoForMonth/
// totwForWeek/tema da Loja).
export function buildFullCatalog(dataset: TeamSeason[], mi: number): { base: UltCard[]; catalog: UltCard[] } {
  const base = buildCatalog(dataset);
  const specials = [...totsSpecs(base), ...majorSpecs(dataset), ...promoSpecsThrough(base, mi), ...totwSpecsThroughMonth(base, mi)];
  return { base, catalog: [...appendSpecials(dataset, base, [...specials, ...legacySpecialsFor(specials, mi)]), ...iconCards()] };
}

// Especiais que JÁ existiam em produção naquele mês e que o ranking atual não
// escolheria mais (a base real de atributos mexe no OVR): voltam com o boost da
// raridade — carta da coleção nunca some do catálogo.
const LEGACY_BOOST = { tots: TOTS_BOOST, major: MAJOR_BOOST, promo: PROMO_BOOST, totw: TOTW_BOOST } as const;
export function legacySpecialsFor(specials: SpecialSpec[], mi: number): SpecialSpec[] {
  const have = new Set(specials.map((s) => `${s.playerId}:${s.rarity}`));
  const out: SpecialSpec[] = [];
  for (const [playerId, rarity, first] of LEGACY_SPECIALS) {
    if (first > mi || have.has(`${playerId}:${rarity}`)) continue;
    have.add(`${playerId}:${rarity}`);
    out.push({ playerId, rarity, ovrBoost: LEGACY_BOOST[rarity] });
  }
  return out;
}
