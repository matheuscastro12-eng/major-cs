// Ultimate Squad — quick-sell (descarte por moedas). Portado verbatim da regra
// do BUT: base por raridade × bônus de OVR (até +50% acima de 75) × penalidade
// de "única" (1ª cópia vale 70% → incentiva guardar únicas, vender duplicatas).
// Puro. Ver docs-but-map.md §2.2.

import { rarityInfo, type UltRarity } from './rarities';

export const QUICKSELL_RULES = {
  ovrBonusPerPoint: 0.05,
  ovrBonusBaseline: 75,
  ovrBonusCap: 0.5,
  uniquePenalty: 0.7,
} as const;

export function quickSellValue(rarity: UltRarity, ovr: number, isDuplicate: boolean): number {
  const base = rarityInfo(rarity).quickSellBase;
  const safeOvr = Math.max(1, Math.min(99, ovr));
  const ovrBonus = Math.max(
    0,
    Math.min(QUICKSELL_RULES.ovrBonusCap, (safeOvr - QUICKSELL_RULES.ovrBonusBaseline) * QUICKSELL_RULES.ovrBonusPerPoint),
  );
  const value = Math.floor(base * (1 + ovrBonus));
  return isDuplicate ? value : Math.floor(value * QUICKSELL_RULES.uniquePenalty);
}
