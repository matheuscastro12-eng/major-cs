// Ultimate Squad P6 — "bazar" e leaderboard de IA (offline). Substitui o
// marketplace P2P + o ranking global do BUT por dados gerados localmente:
//  - ladder de IA com os NOMES REAIS dos jogadores (elo derivado do OVR)
//  - listagens de mercado precificadas por estimateCardValue ± spread
// Puro/determinístico (seed). Ver docs-but-map.md §4 (P6).

import { makeRng } from '../rng';
import { estimateCardValue, type UltCard } from './cards';

export interface AiPlayer { id: string; nick: string; country: string; elo: number; w: number; l: number }

export interface LadderSeed { nick: string; country: string; ovr: number }

// ladder de IA a partir do pool real: cada pro vira um rival com elo ~ f(OVR).
export function buildAiLadder(pool: LadderSeed[], seed: number): AiPlayer[] {
  const rng = makeRng((seed >>> 0) || 1);
  const out: AiPlayer[] = [];
  for (const p of pool) {
    const base = 900 + (p.ovr - 70) * 42;                 // OVR 70→900, 95→1950
    const elo = Math.max(600, Math.round(base + (rng() * 2 - 1) * 110));
    const games = 25 + Math.floor(rng() * 75);
    const wrTarget = 0.35 + (p.ovr - 70) / 55 + (rng() * 0.2 - 0.1);
    const wr = Math.max(0.15, Math.min(0.9, wrTarget));
    const w = Math.round(games * wr);
    out.push({ id: `ai_${p.nick.toLowerCase()}`, nick: p.nick, country: p.country, elo, w, l: Math.max(0, games - w) });
  }
  return out.sort((a, b) => b.elo - a.elo);
}

export interface Listing { id: string; cardKey: string; price: number; sellerNick: string }

// listagens do bazar: cartas aleatórias do catálogo precificadas por valor de
// mercado com um spread, vendidas por "sellers" (nicks da ladder). Rotaciona por
// `seed` (a UI usa um bucket de tempo → o mercado "renova").
export function buildBazaar(catalog: UltCard[], sellers: string[], seed: number, count = 24): Listing[] {
  const rng = makeRng((seed >>> 0) || 1);
  const n = catalog.length;
  if (!n) return [];
  const used = new Set<number>();
  const out: Listing[] = [];
  let guard = 0;
  while (out.length < count && guard < count * 10) {
    guard++;
    const i = Math.floor(rng() * n);
    if (used.has(i)) continue;
    used.add(i);
    const c = catalog[i];
    const price = Math.max(50, Math.round(estimateCardValue(c.ovr, c.rarity) * (0.82 + rng() * 0.38)));
    out.push({ id: `lst_${i}_${Math.floor(rng() * 1_000_000)}`, cardKey: c.key, price, sellerNick: sellers[Math.floor(rng() * sellers.length)] ?? 'IA' });
  }
  return out.sort((a, b) => a.price - b.price);
}

// bucket de tempo (dias desde epoch) — muda o seed do bazar 1×/dia.
export function bazaarDayBucket(nowMs: number): number {
  return Math.floor(nowMs / 86400000);
}
