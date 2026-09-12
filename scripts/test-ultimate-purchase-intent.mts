// [U08] intenção de compra (TTL, forma) e oferta inicial (desligada, elegibilidade única).
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeIntent, INTENT_TTL_MS } from '../src/state/purchaseIntent.ts';
import { STARTER_OFFER, STARTER_OFFER_TIER, starterOfferEligible } from '../src/engine/ultimate/starterOffer.ts';

test('intenção: válida dentro do TTL, expira depois, rejeita forma estranha', () => {
  const now = 1_000_000_000_000;
  const ok = normalizeIntent({ v: 1, product_kind: 'coins', tier: 'p10', method: 'pix', tab: 'store', src: 'store', at: now - 1000 }, now);
  assert.ok(ok && ok.tier === 'p10' && ok.tab === 'store');
  assert.equal(normalizeIntent({ v: 1, product_kind: 'coins', tab: 'store', at: now - INTENT_TTL_MS - 1 }, now), null);
  assert.equal(normalizeIntent({ v: 1, product_kind: 'x', tab: 'store', at: now }, now), null);
  assert.equal(normalizeIntent({ v: 2, product_kind: 'coins', tab: 'store', at: now }, now), null);
});

test('oferta inicial: DESLIGADA por padrão; ligada só com preço; única por conta; janela de partidas', () => {
  assert.equal(starterOfferEligible(STARTER_OFFER, [], 3).reason, 'disabled');
  const on = { ...STARTER_OFFER, enabled: true };
  assert.equal(starterOfferEligible(on, [], 3).reason, 'no_price');
  const priced = { ...on, priceCents: 990 };
  assert.equal(starterOfferEligible(priced, [], 0).reason, 'too_early');
  assert.equal(starterOfferEligible(priced, [], 11).reason, 'expired');
  assert.equal(starterOfferEligible(priced, [{ tier: STARTER_OFFER_TIER, status: 'claimed' }], 3).reason, 'already');
  assert.equal(starterOfferEligible(priced, [{ tier: STARTER_OFFER_TIER, status: 'pending' }], 3).eligible, true);
  assert.equal(starterOfferEligible(priced, [], 3).eligible, true);
  for (const o of STARTER_OFFER.options) assert.ok(o.grants.kind === 'cosmetic' || o.grants.count > 0, 'conteúdo conhecido');
});
