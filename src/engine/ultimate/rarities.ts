// Ultimate Squad — ladder de raridades (adaptação CS do sistema de rarezas do
// BUT/FUT). Puro, determinístico, sem deps de DOM/save. Ver docs-but-map.md §4.
//
// 7 tiers base derivados por OVR (bronze→icon) + 2 specials curados (tots/major)
// que NÃO saem do OVR (são atribuídos à mão / por conquista) e dão boost.

export type UltRarity =
  | 'bronze'
  | 'silver'
  | 'gold'
  | 'rareGold'
  | 'elite'
  | 'legendary'
  | 'icon'
  | 'tots'   // Time da Temporada (special)
  | 'major'; // Campeão de Major (special)

export type RarityBucket = 'bronze' | 'silver' | 'gold' | 'special';

export interface RarityInfo {
  id: UltRarity;
  label: string;
  tier: number;        // ordinal p/ ordenar e p/ "garantia mínima" nos packs
  ovrMin: number;
  ovrMax: number;
  bucket: RarityBucket;
  color: string;       // hex (dado; a UI usa tokens em-* por cima)
  valueMult: number;   // multiplicador no valor de mercado estimado
  quickSellBase: number;
  special: boolean;    // não derivável de OVR (curado)
}

export const RARITIES: Record<UltRarity, RarityInfo> = {
  bronze:    { id: 'bronze',    label: 'Bronze',    tier: 1,  ovrMin: 1,  ovrMax: 67, bucket: 'bronze',  color: '#cd7f32', valueMult: 0.6, quickSellBase: 25,    special: false },
  silver:    { id: 'silver',    label: 'Prata',     tier: 2,  ovrMin: 68, ovrMax: 73, bucket: 'silver',  color: '#c3ccd6', valueMult: 1.5, quickSellBase: 100,   special: false },
  gold:      { id: 'gold',      label: 'Ouro',      tier: 3,  ovrMin: 74, ovrMax: 79, bucket: 'gold',    color: '#e8c170', valueMult: 3,   quickSellBase: 400,   special: false },
  rareGold:  { id: 'rareGold',  label: 'Ouro Raro', tier: 4,  ovrMin: 80, ovrMax: 83, bucket: 'gold',    color: '#f0d878', valueMult: 6,   quickSellBase: 1000,  special: false },
  elite:     { id: 'elite',     label: 'Elite',     tier: 5,  ovrMin: 84, ovrMax: 87, bucket: 'gold',    color: '#6fc3df', valueMult: 12,  quickSellBase: 3000,  special: false },
  legendary: { id: 'legendary', label: 'Lendário',  tier: 6,  ovrMin: 88, ovrMax: 91, bucket: 'gold',    color: '#c792ea', valueMult: 20,  quickSellBase: 8000,  special: false },
  icon:      { id: 'icon',      label: 'Ícone',     tier: 7,  ovrMin: 92, ovrMax: 99, bucket: 'gold',    color: '#f3cf6b', valueMult: 30,  quickSellBase: 20000, special: false },
  // specials — ovrMin/Max só delimitam onde costumam cair; a atribuição é curada
  tots:      { id: 'tots',      label: 'Time da Temporada', tier: 8,  ovrMin: 84, ovrMax: 96, bucket: 'special', color: '#5ed88a', valueMult: 15, quickSellBase: 7000,  special: true },
  major:     { id: 'major',     label: 'Campeão de Major',  tier: 9,  ovrMin: 84, ovrMax: 97, bucket: 'special', color: '#e58a8a', valueMult: 18, quickSellBase: 10000, special: true },
};

// tiers base (derivados por OVR), do mais fraco pro mais forte
export const BASE_RARITY_ORDER: UltRarity[] = ['bronze', 'silver', 'gold', 'rareGold', 'elite', 'legendary', 'icon'];

// cascata de fallback (mais forte → mais fraco) — usada pelo roll de pack pra
// garantir que uma "garantia" sempre encontra carta mesmo se um tier estiver vazio.
export const RARITY_FALLBACK: UltRarity[] = ['icon', 'legendary', 'elite', 'rareGold', 'gold', 'silver', 'bronze'];

export function rarityInfo(r: UltRarity): RarityInfo {
  return RARITIES[r] ?? RARITIES.bronze;
}

export function isSpecial(r: UltRarity): boolean {
  return rarityInfo(r).special;
}

// raridade BASE de um OVR (nunca special). Clampa fora das bordas.
export function rarityFromOvr(ovr: number): UltRarity {
  const o = Math.max(1, Math.min(99, Math.round(ovr)));
  for (const id of BASE_RARITY_ORDER) {
    const info = RARITIES[id];
    if (o >= info.ovrMin && o <= info.ovrMax) return id;
  }
  return o >= 92 ? 'icon' : 'bronze';
}

// pertence a um bucket? (specials contam no bucket 'special'; 'gold' cobre todas
// as douradas — gold/rareGold/elite/legendary/icon — como no BUT).
export function rarityMatchesBucket(r: UltRarity, bucket: RarityBucket): boolean {
  const info = rarityInfo(r);
  if (bucket === 'gold') return info.bucket === 'gold';
  return info.bucket === bucket;
}
