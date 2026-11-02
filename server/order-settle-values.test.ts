// Valor pago × pedido nos webhooks de coins/Passe: tabela única pro órfão e
// moeda obrigatória BRL no Stripe.
import assert from 'node:assert/strict';
import test from 'node:test';
import { expectedOrder, stripePaidCents } from './order-settle.js';
import { COIN_TIERS, PASS_PRICE_CENTS } from './payments.js';

test('expectedOrder: coins e passe vêm da tabela do servidor', () => {
  assert.deepEqual(expectedOrder('p10'), { cents: COIN_TIERS.p10.cents, coins: COIN_TIERS.p10.coins });
  assert.deepEqual(expectedOrder('p30'), { cents: 3000, coins: 120000 });
  assert.deepEqual(expectedOrder('pass-s3'), { cents: PASS_PRICE_CENTS, coins: 0 });
  assert.equal(expectedOrder('p999'), undefined);
  assert.equal(expectedOrder('pass-x'), undefined);
  assert.equal(expectedOrder(''), undefined);
});

test('stripePaidCents: só BRL conta; outra moeda/valor ausente = -1', () => {
  assert.equal(stripePaidCents({ amount_total: 1500, currency: 'brl' }), 1500);
  assert.equal(stripePaidCents({ amount_total: 1500, currency: 'BRL' }), 1500);
  assert.equal(stripePaidCents({ amount_total: 1500, currency: 'usd' }), -1);
  assert.equal(stripePaidCents({ amount_total: null, currency: 'brl' }), -1);
  assert.equal(stripePaidCents({ amount_total: 1500 }), -1);
});

test('órfão do Stripe com valor pago menor que a tabela não iguala o pedido', () => {
  const exp = expectedOrder('p30')!;
  const paid = stripePaidCents({ amount_total: 1000, currency: 'brl' });
  assert.notEqual(exp.cents, paid); // settleOrder grava value_mismatch, não credita
});
