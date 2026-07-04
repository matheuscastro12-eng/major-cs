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
// Cada faixa exige o PICO da season cruzar o piso EXATO da divisão homônima
// (ver divisions.ts): Bronze II=1050, Prata III=1150, Ouro III=1375,
// Platina=1600, Elite=1950. Antes ouro/platina/elite ficavam ~75-250 RP ABAIXO
// do piso da sua divisão (ex.: a special 'major' liberava em 1700 = ainda
// Platina, não Elite) — o rótulo mentia pro jogador e a special mais rara do
// catálogo virava faucet recorrente cedo demais, minando os packs pagos (TOTS
// 38k / promo 25k). Com o alinhamento, ganhar o TOTS/Major exige de fato chegar
// à Platina/Elite, e as 5 faixas batem 1:1 com a escada de divisões da UI.
export const SEASON_TIERS: SeasonTier[] = [
  { id: 's-bronze', name: 'Bronze', rp: 1050, reward: { credits: 1500 } },
  { id: 's-prata', name: 'Prata', rp: 1150, reward: { credits: 3500 } },
  { id: 's-ouro', name: 'Ouro', rp: 1375, reward: { credits: 7000, card: 'rareGold' } },
  { id: 's-platina', name: 'Platina', rp: 1600, reward: { credits: 14000, card: 'tots' } },
  { id: 's-elite', name: 'Elite', rp: 1950, reward: { credits: 28000, card: 'major' } },
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
