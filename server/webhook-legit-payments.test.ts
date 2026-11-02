// Pagamento LEGÍTIMO nunca é recusado pela checagem valor pago × pedido.
// Para cada produto (coins p10/p15/p30, Passe, conta vitalícia) e cada meio
// (Pix/Woovi e cartão/Stripe), o valor que o provedor reporta num pagamento
// normal (BRL, centavos inteiros) baixa o pedido como 'paid' — inclusive na
// rede de segurança (pedido órfão) e com o Adaptive Pricing do Stripe.
import assert from 'node:assert/strict';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { neon } from '@neondatabase/serverless';
import wooviWebhook from '../api/woovi-webhook.js';
import { FakeNeonHttp, type Row, type SeenQuery } from './neon-fetch.mock.js';
import { expectedOrder, settleOrder, stripePaidCents, type SettleSql } from './order-settle.js';
import { accountPriceCents, COIN_TIERS, PASS_PRICE_CENTS, passTier } from './payments.js';

process.env.APP_SECRET = 'test-secret';
process.env.DATABASE_URL = 'postgresql://user:pw@fake-neon.test/db';

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 1024 });
process.env.WOOVI_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }).toString();

function signed(payload: unknown): Request {
  const raw = JSON.stringify(payload);
  const s = createSign('sha256');
  s.update(raw);
  s.end();
  return new Request('https://example.com/api/woovi-webhook', { method: 'POST', headers: { 'x-webhook-signature': s.sign(privateKey, 'base64') }, body: raw });
}

interface Order { email: string; tier: string; cents: number; coins: number; status: string }

// "banco" que emula as queries de server/order-settle.ts (mesmo CASE de status)
function db(orders: Record<string, Order> = {}) {
  const events = new Set<string>();
  const paidEmails: string[] = [];
  const fake = new FakeNeonHttp((q: SeenQuery): Row[] => {
    const t = q.text;
    if (t.startsWith('INSERT INTO rtm_webhook_events')) {
      const key = String(q.params[0]);
      if (events.has(key)) return [];
      events.add(key);
      return [{ event_key: key }];
    }
    if (t.startsWith('UPDATE rtm_coin_orders o SET')) {
      const [paid, , corr] = q.params as [string, string, string];
      const o = orders[corr];
      if (!o || o.status !== 'pending') return [];
      o.status = o.cents !== Number(paid) ? 'value_mismatch' : 'paid';
      return [{ status: o.status, email: o.email, tier: o.tier }];
    }
    if (t.startsWith('SELECT status, email, tier FROM rtm_coin_orders')) {
      const o = orders[String(q.params[0])];
      return o ? [{ status: o.status, email: o.email, tier: o.tier }] : [];
    }
    if (t.startsWith('INSERT INTO rtm_coin_orders')) {
      // órfão: [corr, email, tier, coins, cents, cents, pago, ...]
      const [corr, email, tier, coins, cents, cents2, paid] = q.params as [string, string, string, number, number, number, number];
      if (orders[corr]) return [];
      const status = Number(cents2) !== Number(paid) ? 'value_mismatch' : 'paid';
      orders[corr] = { email, tier, coins: Number(coins), cents: Number(cents), status };
      return [{ status }];
    }
    if (t.startsWith('INSERT INTO rtm_paid_emails')) { paidEmails.push(String(q.params[0])); return []; }
    return [];
  });
  return { orders, paidEmails, uninstall: fake.install() };
}

// todos os produtos de pedido, com o que o servidor grava ao criar a cobrança
const PRODUCTS: { tier: string; cents: number; coins: number }[] = [
  ...Object.entries(COIN_TIERS).map(([tier, p]) => ({ tier, cents: p.cents, coins: p.coins })),
  { tier: passTier(5), cents: PASS_PRICE_CENTS, coins: 0 },
];

// sessão do Stripe como api/account.ts cria (coinsCheckout/passCheckout): 1 item,
// BRL, unit_amount = cents do pedido, sem cupom nem imposto → amount_total = cents
const stripeSession = (cents: number, extra: Record<string, unknown> = {}) => ({ amount_total: cents * 1, currency: 'brl', ...extra });

test('Pix (Woovi): coins p10/p15/p30 e Passe com o valor do pedido baixam como paid', async () => {
  for (const p of PRODUCTS) {
    const corr = `ultcoins:${p.tier}:abc:${p.tier}`;
    const { orders, uninstall } = db({ [corr]: { email: 'j@x.com', tier: p.tier, cents: p.cents, coins: p.coins, status: 'pending' } });
    try {
      const r = await wooviWebhook.fetch(signed({ event: 'OPENPIX:CHARGE_COMPLETED', charge: { correlationID: corr, value: p.cents }, pix: { value: p.cents, endToEndId: `E-${p.tier}` } }));
      const body = await r.json() as Record<string, unknown>;
      assert.equal(body.status, 'paid', p.tier);
      assert.equal(orders[corr].status, 'paid', p.tier);
    } finally { uninstall(); }
  }
});

test('Pix (Woovi) órfão: pedido reconstruído pela tabela bate com o valor legítimo', async () => {
  for (const p of PRODUCTS) {
    const corr = `ultcoins:${p.tier}:orfao:${p.tier}`;
    const { orders, uninstall } = db();
    try {
      const r = await wooviWebhook.fetch(signed({ event: 'OPENPIX:CHARGE_COMPLETED', charge: { correlationID: corr, value: p.cents, customer: { email: 'j@x.com' } }, pix: { value: p.cents, endToEndId: `O-${p.tier}` } }));
      const body = await r.json() as Record<string, unknown>;
      assert.equal(body.status, 'paid', p.tier);
      assert.equal(orders[corr].cents, p.cents);
    } finally { uninstall(); }
  }
});

test('cartão (Stripe): coins e Passe com o amount_total da sessão criada baixam como paid', async () => {
  for (const p of PRODUCTS) {
    const corr = `ultcoins:${p.tier}:st:${p.tier}`;
    const { orders, uninstall } = db({ [corr]: { email: 'j@x.com', tier: p.tier, cents: p.cents, coins: p.coins, status: 'pending' } });
    try {
      const paid = stripePaidCents(stripeSession(p.cents));
      assert.equal(paid, p.cents);
      const r = await settleOrder(neon(process.env.DATABASE_URL as string) as unknown as SettleSql, corr, paid, 'stripe');
      assert.equal(r.status, 'paid', p.tier);
      assert.equal(orders[corr].status, 'paid');
    } finally { uninstall(); }
  }
});

test('cartão (Stripe) órfão: o pedido sai da tabela do servidor e bate com o valor legítimo', async () => {
  for (const p of PRODUCTS) {
    const corr = `ultcoins:${p.tier}:st-orfao:${p.tier}`;
    const { orders, uninstall } = db();
    try {
      const exp = expectedOrder(p.tier)!;
      assert.deepEqual(exp, { cents: p.cents, coins: p.coins });
      const paid = stripePaidCents(stripeSession(p.cents));
      const r = await settleOrder(neon(process.env.DATABASE_URL as string) as unknown as SettleSql, corr, paid, 'stripe', { email: 'j@x.com', tier: p.tier, ...exp });
      assert.equal(r.status, 'paid', p.tier);
      assert.equal(orders[corr].coins, p.coins);
    } finally { uninstall(); }
  }
});

test('Stripe com Adaptive Pricing (cliente pagou em outra moeda): amount_total/currency seguem em BRL e o pedido baixa', () => {
  // docs.stripe.com/payments/checkout/automatic-currency-conversion: a sessão fica na
  // moeda da integração; o que o cliente viu vai em presentment_details
  const s = stripeSession(3000, { presentment_details: { presentment_amount: 612, presentment_currency: 'usd' } });
  assert.equal(stripePaidCents(s), 3000);
  assert.equal(stripePaidCents({ amount_total: 3000, currency: 'BRL' }), 3000);
});

test('conta vitalícia por Pix: valor do preço atual (padrão e PIX_PRICE_CENTS) ativa a conta', async () => {
  const prev = process.env.PIX_PRICE_CENTS;
  try {
    for (const env of [undefined, '1500', '2000', '2990']) {
      if (env === undefined) delete process.env.PIX_PRICE_CENTS; else process.env.PIX_PRICE_CENTS = env;
      const price = accountPriceCents();
      const { paidEmails, uninstall } = db();
      try {
        const corr = `rtm-dono${price}@x.com-1700000000`;
        const r = await wooviWebhook.fetch(signed({ event: 'OPENPIX:CHARGE_COMPLETED', charge: { correlationID: corr, value: price }, pix: { value: price, endToEndId: `V-${price}` } }));
        const body = await r.json() as Record<string, unknown>;
        assert.equal(body.processed, true, `preço ${price}`);
        assert.deepEqual(paidEmails, [`dono${price}@x.com`]);
      } finally { uninstall(); }
    }
  } finally {
    if (prev === undefined) delete process.env.PIX_PRICE_CENTS; else process.env.PIX_PRICE_CENTS = prev;
  }
});

test('as sessões de cartão de coins e Passe são criadas sem cupom, imposto ou quantidade > 1 (amount_total = cents)', () => {
  const src = readFileSync(new URL('../api/account.ts', import.meta.url), 'utf8');
  for (const action of ['coinsCheckout', 'passCheckout']) {
    const start = src.indexOf(`if (action === '${action}')`);
    assert.ok(start > 0, action);
    const block = src.slice(start, src.indexOf("if (action === '", start + 20));
    assert.match(block, /quantity: 1,/);
    assert.match(block, /currency: 'brl'/);
    assert.match(block, /unit_amount: (pack\.cents|PASS_PRICE_CENTS)/);
    assert.doesNotMatch(block, /allow_promotion_codes|discounts|automatic_tax|shipping/, action);
  }
});
