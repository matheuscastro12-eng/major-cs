// Ultimate Squad — definição de packs + roll determinístico (seeded). Portado da
// lógica do BUT (`packs.ts`: weighted rarity + garantias por bucket + fallback
// cascade), mas 100% client com o nosso `rng.ts`. Ver docs-but-map.md §2.2/§4.

import type { Rng } from '../rng';
import { pick, weightedIndex } from '../rng';
import type { UltCard } from './cards';
import { RARITY_FALLBACK, rarityMatchesBucket, type RarityBucket, type UltRarity } from './rarities';

export interface PackGuarantee {
  bucket: RarityBucket; // garante ao menos 1 carta desse bucket (ou melhor, via weights)
  count: number;
}

export interface PackDef {
  id: string;
  name: string;
  desc: string;
  cost: number;                              // em credits
  cards: number;                             // cartas por pack
  weights: Partial<Record<UltRarity, number>>;
  guaranteed?: PackGuarantee[];
  color: string;                             // accent (hex) pro card da loja
}

// Odds calibradas pro nosso dataset (moeda única `credits`). Só tiers BASE — os
// specials (tots/major) entram em packs próprios quando o catálogo os tiver.
export const PACK_DEFS: PackDef[] = [
  {
    id: 'bronze', name: 'Pacote Bronze', desc: '5 cartas · 1 prata garantida',
    cost: 2500, cards: 5, color: '#cd7f32',
    weights: { bronze: 55, silver: 35, gold: 9, rareGold: 1 },
    guaranteed: [{ bucket: 'silver', count: 1 }],
  },
  {
    id: 'silver', name: 'Pacote Prata', desc: '5 cartas · 1 ouro garantido',
    cost: 6000, cards: 5, color: '#c3ccd6',
    weights: { silver: 42, gold: 38, rareGold: 15, elite: 5 },
    guaranteed: [{ bucket: 'gold', count: 1 }],
  },
  {
    id: 'gold', name: 'Pacote Ouro', desc: '7 cartas · 2 ouros garantidos',
    cost: 14000, cards: 7, color: '#e8c170',
    weights: { gold: 48, rareGold: 34, elite: 14, legendary: 3.5, icon: 0.5 },
    guaranteed: [{ bucket: 'gold', count: 2 }],
  },
  {
    // temático: só existe porque o catálogo agora tem specials TOTS curadas
    id: 'tots', name: 'Pacote TOTS', desc: '5 cartas · 1 Time da Temporada garantida',
    cost: 30000, cards: 5, color: '#5ed88a',
    weights: { rareGold: 42, elite: 36, legendary: 14, icon: 4, tots: 4 },
    guaranteed: [{ bucket: 'special', count: 1 }],
  },
  {
    id: 'premium', name: 'Pacote Premium', desc: '11 cartas · 3 ouros raros garantidos',
    cost: 40000, cards: 11, color: '#c792ea',
    weights: { rareGold: 46, elite: 38, legendary: 13, icon: 3 },
    guaranteed: [{ bucket: 'gold', count: 3 }],
  },
];

// Pacote Promo — fora de PACK_DEFS de propósito: só vende durante o mês da promo
// (a Loja o renderiza à parte, com o tema e o countdown de promos.ts). Como o
// bucket 'special' dos weights só tem 'promo', a garantia resolve SEMPRE numa
// carta promo (nunca cai em tots/major).
export const PROMO_PACK: PackDef = {
  id: 'promo', name: 'Pacote Promo', desc: '5 cartas · 1 promo do mês garantida',
  cost: 25000, cards: 5, color: '#f472b6',
  weights: { gold: 28, rareGold: 36, elite: 24, legendary: 8, promo: 4 },
  guaranteed: [{ bucket: 'special', count: 1 }],
};

export function packById(id: string): PackDef | undefined {
  if (id === PROMO_PACK.id) return PROMO_PACK;
  return PACK_DEFS.find((p) => p.id === id);
}

// agrupa o catálogo por raridade (pra pescar carta de uma raridade rápido).
function groupByRarity(catalog: UltCard[]): Map<UltRarity, UltCard[]> {
  const m = new Map<UltRarity, UltCard[]>();
  for (const c of catalog) {
    const arr = m.get(c.rarity);
    if (arr) arr.push(c);
    else m.set(c.rarity, [c]);
  }
  return m;
}

// pesca uma carta de uma raridade; se vazia, desce a cascata de fallback até
// achar um pool não-vazio (garante que SEMPRE retorna carta).
function pickCardOfRarity(byRarity: Map<UltRarity, UltCard[]>, rarity: UltRarity, rng: Rng): UltCard | null {
  // tenta a raridade EXATA primeiro: specials (tots/major) não estão na cascata
  // RARITY_FALLBACK — sem isso a garantia de bucket 'special' devolvia icon.
  const exact = byRarity.get(rarity);
  if (exact && exact.length) return pick(rng, exact);
  const startIdx = Math.max(0, RARITY_FALLBACK.indexOf(rarity));
  for (let i = startIdx; i < RARITY_FALLBACK.length; i++) {
    const pool = byRarity.get(RARITY_FALLBACK[i]);
    if (pool && pool.length) return pick(rng, pool);
  }
  // ninguém abaixo → tenta qualquer pool não-vazio
  for (const pool of byRarity.values()) if (pool.length) return pick(rng, pool);
  return null;
}

// resolve uma garantia de bucket numa raridade concreta, usando os weights do
// pack restritos ao bucket; se nada bater, cai na raridade canônica do bucket.
function resolveGuaranteedRarity(bucket: RarityBucket, weights: PackDef['weights'], rng: Rng): UltRarity {
  const keys = (Object.keys(weights) as UltRarity[]).filter((k) => rarityMatchesBucket(k, bucket));
  if (keys.length) {
    const w = keys.map((k) => weights[k] ?? 0);
    if (w.some((x) => x > 0)) return keys[weightedIndex(rng, w)];
    return keys[0];
  }
  const canon: Record<RarityBucket, UltRarity> = { bronze: 'bronze', silver: 'silver', gold: 'gold', special: 'tots' };
  return canon[bucket];
}

// abre um pack: garantias primeiro, resto por weights. Determinístico dado o rng.
export function rollPack(catalog: UltCard[], pack: PackDef, rng: Rng): UltCard[] {
  const byRarity = groupByRarity(catalog);
  const out: UltCard[] = [];
  const guaranteed = pack.guaranteed ?? [];
  let guaranteedCount = 0;
  for (const g of guaranteed) {
    for (let i = 0; i < g.count; i++) {
      const rarity = resolveGuaranteedRarity(g.bucket, pack.weights, rng);
      const c = pickCardOfRarity(byRarity, rarity, rng);
      if (c) out.push(c);
      guaranteedCount++;
    }
  }
  const rest = Math.max(0, pack.cards - guaranteedCount);
  const keys = Object.keys(pack.weights) as UltRarity[];
  const w = keys.map((k) => pack.weights[k] ?? 0);
  for (let i = 0; i < rest; i++) {
    const rarity = keys[weightedIndex(rng, w)];
    const c = pickCardOfRarity(byRarity, rarity, rng);
    if (c) out.push(c);
  }
  return out;
}
