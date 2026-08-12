// LISTAR JOGADOR À VENDA + lances da IA (#15 do gap Brasval). Puro, sem React.
//
// O loop que faltava: "coloquei o reserva no mercado por R$X e alguém compra".
// Você define o preço; a cada fechamento de split a IA avalia — preço abaixo do
// mercado vende rápido, preço ganancioso encalha. A venda fechada entra no
// MESMO trilho das propostas aceitas (pendingSales → consumada na janela), então
// o jogador migra de verdade pro clube comprador.
//
// Curva de chance POR SPLIT (1 roll por fechamento) em função de
// ratio = preço pedido / valor de mercado:
//   ≤0.7 → 90% (preço de banana some da prateleira)
//   1.0  → 45%
//   1.3  → 12%
//   ≥1.6 → 2%  (ganância tem prateleira longa)
// Determinístico por (jogador, split) via hashStr — sem RNG de save.

import { hashStr } from '../../state/hash';

export const LISTING_MAX_RATIO = 2;      // teto de preço: 2× o valor de mercado

export interface ListingBuyer { id: string; name: string; tag: string }

export interface ListedSaleHit {
  playerId: string;
  fee: number;
  buyer: ListingBuyer;
}

export function listingSaleChance(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio <= 0) return 0;
  if (ratio <= 0.7) return 0.9;
  if (ratio >= 1.6) return 0.02;
  // interpolação linear por trechos (0.7→0.9, 1.0→0.45, 1.3→0.12, 1.6→0.02)
  const pts: [number, number][] = [[0.7, 0.9], [1.0, 0.45], [1.3, 0.12], [1.6, 0.02]];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i]; const [x1, y1] = pts[i + 1];
    if (ratio <= x1) return y0 + ((ratio - x0) / (x1 - x0)) * (y1 - y0);
  }
  return 0.02;
}

export interface TickListedArgs {
  listed: Record<string, number>;             // playerId → preço pedido
  split: number;
  valueOf: (playerId: string) => number | null; // valor de mercado ATUAL (null = não avaliável)
  buyers: ListingBuyer[];                     // clubes candidatos (sem o seu)
  exclude?: Set<string>;                      // já vendidos/em pendingSales
}

// Um roll por jogador listado; comprador sorteado por hash entre os candidatos.
export function tickListedSales(a: TickListedArgs): ListedSaleHit[] {
  const out: ListedSaleHit[] = [];
  if (!a.buyers.length) return out;
  for (const [pid, price] of Object.entries(a.listed)) {
    if (a.exclude?.has(pid)) continue;
    const value = a.valueOf(pid);
    if (value == null || value <= 0 || !Number.isFinite(price) || price <= 0) continue;
    const chance = listingSaleChance(price / value);
    const roll = (hashStr(`listed:${pid}:${a.split}`) % 1000) / 1000;
    if (roll >= chance) continue;
    const buyer = a.buyers[hashStr(`buyer:${pid}:${a.split}`) % a.buyers.length];
    out.push({ playerId: pid, fee: Math.round(price), buyer });
  }
  return out;
}
