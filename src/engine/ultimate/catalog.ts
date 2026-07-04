// Ultimate Squad — derivação COMPLETA do catálogo (base + specials curadas).
// Extraído do ensureCatalog de src/state/ultimate.ts pra que cliente E servidor
// (server/ultimate-pack.ts, fase 2 da economia server-authoritative) montem o
// MESMO catálogo a partir do mesmo dataset — sem fork das regras/odds.
// Puro/determinístico: mesma (dataset, monthIndex) ⇒ mesmo catálogo.
import type { TeamSeason } from '../../types';
import { appendSpecials, buildCatalog, type SpecialSpec, type UltCard } from './cards';
import { promoSpecsThrough } from './promos';

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
// todos os meses desde a época. Devolve também a base (o chamador costuma
// precisar dela pra promoForMonth/tema da Loja).
export function buildFullCatalog(dataset: TeamSeason[], mi: number): { base: UltCard[]; catalog: UltCard[] } {
  const base = buildCatalog(dataset);
  const specials = [...totsSpecs(base), ...majorSpecs(dataset), ...promoSpecsThrough(base, mi)];
  return { base, catalog: appendSpecials(dataset, base, specials) };
}
