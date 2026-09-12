// [U08] OFERTA INICIAL COM ESCOLHA — ESPECIFICAÇÃO EXECUTÁVEL, DESLIGADA.
//
// O plano pede conteúdo conhecido, escolha entre reforços equilibrados e um
// cosmético, elegibilidade única por conta e preço configurável AINDA A DEFINIR.
// Este módulo fixa o contrato (id, versão, opções, regra de elegibilidade) sem
// ativar venda: `STARTER_OFFER.enabled = false` e `priceCents = null`. Ativar
// exige decisão do proprietário + tier no servidor (COIN_TIERS) + sandbox.
export const STARTER_OFFER_TIER = 'starter-v1';   // tier do pedido (rtm_coin_orders.tier) quando existir

export interface StarterOfferOption {
  id: 'reforcos' | 'cosmetico';
  name: string;
  desc: string;
  // conteúdo CONHECIDO — nada de sorteio sem garantia
  grants: { kind: 'card'; rarity: 'gold' | 'rareGold'; count: number; roleFit: boolean } | { kind: 'cosmetic'; item: string };
}

export interface StarterOfferDef {
  version: 1;
  enabled: boolean;
  priceCents: number | null;      // A DEFINIR — null = não vendável
  window: { afterMatches: number; untilMatches: number };   // aparece após a 1ª partida e some depois da 10ª
  options: StarterOfferOption[];
}

export const STARTER_OFFER: StarterOfferDef = {
  version: 1,
  enabled: false,
  priceCents: null,
  window: { afterMatches: 1, untilMatches: 10 },
  options: [
    { id: 'reforcos', name: 'Dois reforços pro seu esquema', desc: '2 cartas Ouro Raro com a função dos seus slots mais fracos. Conteúdo conhecido, sem sorteio.', grants: { kind: 'card', rarity: 'rareGold', count: 2, roleFit: true } },
    { id: 'cosmetico', name: 'Identidade do clube', desc: 'Moldura de carta + escudo exclusivos da 1ª temporada. Nunca altera força.', grants: { kind: 'cosmetic', item: 'frame-founder-s1' } },
  ],
};

export interface OrderLike { tier: string; status: string }

/** Elegível = oferta ligada, dentro da janela de partidas e SEM pedido pago/claimed
 *  deste tier na conta (mesma regra do dup-check do passe: tier + status). */
export function starterOfferEligible(def: StarterOfferDef, orders: OrderLike[], matchesPlayed: number): { eligible: boolean; reason: 'disabled' | 'no_price' | 'too_early' | 'expired' | 'already' | null } {
  if (!def.enabled) return { eligible: false, reason: 'disabled' };
  if (def.priceCents == null || def.priceCents <= 0) return { eligible: false, reason: 'no_price' };
  if (matchesPlayed < def.window.afterMatches) return { eligible: false, reason: 'too_early' };
  if (matchesPlayed > def.window.untilMatches) return { eligible: false, reason: 'expired' };
  if (orders.some((o) => o.tier === STARTER_OFFER_TIER && (o.status === 'paid' || o.status === 'claimed'))) return { eligible: false, reason: 'already' };
  return { eligible: true, reason: null };
}
