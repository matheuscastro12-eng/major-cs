// [U08] oferta inicial atrás da feature flag: OFF por padrão, sem preço, sem tier no servidor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { STARTER_OFFER, STARTER_OFFER_TIER, starterFlagOn, starterOfferVisibility, formatBRL } from '../src/engine/ultimate/starterOffer.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

test('flag desligada por padrão; só "1"/"true" liga', () => {
  assert.equal(starterFlagOn({}), false);
  assert.equal(starterFlagOn({ VITE_FF_ULTIMATE_STARTER: '0' }), false);
  assert.equal(starterFlagOn({ VITE_FF_ULTIMATE_STARTER: '1' }), true);
  assert.equal(starterOfferVisibility(STARTER_OFFER, [], 3, false), 'flag_off');
});

test('mesmo com a flag ligada, hoje não aparece (enabled=false, sem preço)', () => {
  assert.equal(STARTER_OFFER.priceCents, null);
  assert.equal(starterOfferVisibility(STARTER_OFFER, [], 3, true), 'disabled');
  assert.equal(starterOfferVisibility({ ...STARTER_OFFER, enabled: true }, [], 3, true), 'no_price');
});

test('visível só com flag + enabled + preço + janela + sem pedido pago', () => {
  const on = { ...STARTER_OFFER, enabled: true, priceCents: 990 };
  assert.equal(starterOfferVisibility(on, [], 3, true), 'visible');
  assert.equal(starterOfferVisibility(on, [], 3, false), 'flag_off');
  assert.equal(starterOfferVisibility(on, [{ tier: STARTER_OFFER_TIER, status: 'paid' }], 3, true), 'already');
  assert.equal(formatBRL(990), 'R$ 9,90');
});

test('nada liga a flag nem cria tier/preço neste PR', () => {
  for (const f of ['vercel.json', '.env.example', '.env']) {
    try { assert.ok(!readFileSync(ROOT + f, 'utf8').includes('VITE_FF_ULTIMATE_STARTER'), f); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  }
  assert.ok(!readFileSync(ROOT + 'api/account.ts', 'utf8').includes(STARTER_OFFER_TIER), 'sem tier starter no servidor');
});
