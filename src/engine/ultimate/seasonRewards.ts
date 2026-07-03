// Ladder de recompensas de temporada: faixas de RP que, ao serem ATINGIDAS pelo
// pico da season (season.peak), liberam um prêmio resgatável uma vez. Reseta no
// rollover (startSeason zera peak/claimed). Puro; a store aplica a recompensa.
import type { UltRarity } from './rarities';

export interface SeasonTier {
  id: string;
  name: string;
  rp: number;                                   // pico de RP necessário
  reward: { credits?: number; card?: UltRarity };
}

// Topo da ladder é ASPIRACIONAL: Platina garante um TOTS (fora do pack de 30k)
// e Elite garante um Campeão de Major — as duas specials curadas do catálogo.
export const SEASON_TIERS: SeasonTier[] = [
  { id: 's-bronze', name: 'Bronze', rp: 1050, reward: { credits: 1500 } },
  { id: 's-prata', name: 'Prata', rp: 1150, reward: { credits: 3500 } },
  { id: 's-ouro', name: 'Ouro', rp: 1300, reward: { credits: 7000, card: 'rareGold' } },
  { id: 's-platina', name: 'Platina', rp: 1500, reward: { credits: 14000, card: 'tots' } },
  { id: 's-elite', name: 'Elite', rp: 1700, reward: { credits: 28000, card: 'major' } },
];

export interface SeasonTierProgress {
  tier: SeasonTier;
  reached: boolean;
  claimed: boolean;
}

export function evaluateSeasonTiers(peak: number, claimed: string[]): SeasonTierProgress[] {
  return SEASON_TIERS.map((tier) => ({ tier, reached: peak >= tier.rp, claimed: claimed.includes(tier.id) }));
}

export function seasonTierById(id: string): SeasonTier | undefined {
  return SEASON_TIERS.find((t) => t.id === id);
}
