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

// ── Marco da temporada: "Escolha um Lendário" (rebalance iter47) ─────────────
// Caminho de CONQUISTA (não de sorte): 40 vitórias ranqueadas NA temporada
// liberam a escolha de 1 carta Lendária do catálogo — o jogador ESCOLHE qual
// (determinístico, sem roll). Uma vez por temporada; o resgate entra em
// season.claimed e por isso reseta no rollover junto com a ladder de RP.
// 40 vitórias ≈ 2 sessões/dia por um mês — é o grind de quem JOGA, e conversa
// com a medida A (ranqueada pagando mais): a mesma rotina agora rende credits
// E um Lendário garantido por temporada.
export interface SeasonMilestone {
  id: string;
  name: string;
  desc: string;
  target: number;           // vitórias ranqueadas na temporada
  rewardRarity: UltRarity;  // raridade da carta à ESCOLHA do jogador
}

export const SEASON_MILESTONE: SeasonMilestone = {
  id: 'ms-40wins',
  name: 'Maratona da Temporada',
  desc: 'Vença 40 ranqueadas nesta temporada e escolha um Lendário do catálogo.',
  target: 40,
  rewardRarity: 'legendary',
};

export interface SeasonMilestoneProgress { wins: number; reached: boolean; claimed: boolean }

export function evaluateSeasonMilestone(wins: number, claimed: string[]): SeasonMilestoneProgress {
  const w = Math.max(0, Math.trunc(wins));
  return { wins: w, reached: w >= SEASON_MILESTONE.target, claimed: claimed.includes(SEASON_MILESTONE.id) };
}
