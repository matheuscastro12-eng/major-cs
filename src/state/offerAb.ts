// A/B dos CARDS DE OFERTA da vitalícia (pedido do Growth, nov/2026).
// Funil 28d: landing-pricing 2.327 views → 10 checkouts; home-rtp 2.186 → 0;
// acct-chip-guest 2.185 → 1; upsell-card 1.651 → 3. O gargalo é view → checkout.
//   A = controle (card atual: "Criar conta" → formulário → pagamento)
//   B = CTA "Pagar com Pix" no próprio card, abrindo o checkout Pix direto
//       (AccountModal com pixFirst), benefício claro, preço do servidor
//       (PIX_PRICE_CENTS via GET /api/account) e vagas de Fundador só se houver.
// Split 50/50 estável por sid (hash FNV-1a). ?ab=a|b força (QA/prints).
// O campo vai como `offerVariant` nos eventos (o upsell-card já usa `variant`
// pro teste do teto por sessão — state/paywallPolicy.ts — e não pode colidir).
import { registerOfferVariant, sessionId } from './track';

export type OfferVariant = 'A' | 'B';

/** Superfícies do teste. As demais não mudam de cara (mas o evento leva a variante igual).
 *  home-ultimate entrou no conv/loop-20261108: 166 views/28d sem nenhum checkout
 *  (o card do Ultimate era o único travado sem o CTA de Pix direto). */
export const OFFER_AB_SURFACES = ['landing-pricing', 'home-rtp', 'acct-chip-guest', 'upsell-card', 'home-ultimate'] as const;

/** FNV-1a 32 bits. Puro, testado em scripts/test-offer-ab.mts */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/** Variante de um sid. Sal 'offer-ab-1' separa este teste de outros splits por sid. */
export function offerVariantOf(sid: string, override?: string | null): OfferVariant {
  const o = (override ?? '').toLowerCase();
  if (o === 'a') return 'A';
  if (o === 'b') return 'B';
  return fnv1a(`offer-ab-1:${sid}`) % 2 === 0 ? 'A' : 'B';
}

let cached: OfferVariant | null = null;
export function offerVariant(): OfferVariant {
  if (cached) return cached;
  let o: string | null = null;
  try { o = new URLSearchParams(window.location.search).get('ab'); } catch { /* sem window */ }
  cached = offerVariantOf(sessionId(), o);
  return cached;
}

/** Vagas de Fundador restantes, ou null quando não há dado confiável / esgotou. */
export function foundersLeft(stats: { founders: number; limit: number } | null): number | null {
  if (!stats) return null;
  const left = stats.limit - stats.founders;
  return left > 0 ? left : null;
}

registerOfferVariant(offerVariant);
