// purchase_done: 1 evento por venda nova confirmada no webhook, sem e-mail, e
// telemetria que falha não muda a resposta do pagamento.
import assert from 'node:assert/strict';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import wooviWebhook from '../api/woovi-webhook.js';
import { FakeNeonHttp, type Row, type SeenQuery } from './neon-fetch.mock.js';
import { accountPriceCents, COIN_TIERS, PASS_PRICE_CENTS, passTier } from './payments.js';
import { checkoutKey, productOfTier, purchaseData } from './purchase-event.js';

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

// "banco" com o CASE de status de server/order-settle.ts; failEvents simula a
// tabela events fora do ar
function db(orders: Record<string, Order> = {}, failEvents = false) {
  const keys = new Set<string>();
  const purchases: Record<string, unknown>[] = [];
  const fake = new FakeNeonHttp((q: SeenQuery): Row[] => {
    const t = q.text;
    if (t.startsWith('INSERT INTO rtm_webhook_events')) {
      const k = String(q.params[0]);
      if (keys.has(k)) return [];
      keys.add(k);
      return [{ event_key: k }];
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
    if (t.startsWith("INSERT INTO events (type, sid, data) VALUES ('purchase_done'")) {
      if (failEvents) throw new Error('events fora do ar');
      purchases.push(JSON.parse(String(q.params[0])) as Record<string, unknown>);
      return [];
    }
    return [];
  });
  return { orders, purchases, fake, uninstall: fake.install() };
}

test('purchaseData: produto, método, centavos e ck; nada de e-mail', () => {
  const corr = 'rtm-dono@x.com-1700000000';
  const d = purchaseData({ provider: 'woovi', product: 'vitalicia', cents: 3500, corr });
  assert.deepEqual(d, { product: 'vitalicia', method: 'pix', cents: 3500, ck: checkoutKey(corr) });
  assert.doesNotMatch(JSON.stringify(d), /@|dono/);
  assert.equal(checkoutKey(corr), checkoutKey(corr)); // estável: liga eventos da mesma cobrança
  assert.notEqual(checkoutKey(corr), checkoutKey('rtm-outro@x.com-1700000000'));
  assert.equal(purchaseData({ provider: 'stripe', product: 'pass', cents: 1990, corr: 'ultcoins:pass-s5:a', tier: 'pass-s5' }).method, 'stripe');
  assert.equal(productOfTier('pass-s5'), 'pass');
  assert.equal(productOfTier('p15'), 'coins');
});

test('Pix vitalícia: 1 purchase_done; o webhook repetido do mesmo Pix não grava outro', async () => {
  const price = accountPriceCents();
  const { purchases, uninstall } = db();
  try {
    const payload = { event: 'OPENPIX:CHARGE_COMPLETED', charge: { correlationID: 'rtm-dono@x.com-1700000000', value: price }, pix: { value: price, endToEndId: 'E-VIT-1' } };
    const r1 = await (await wooviWebhook.fetch(signed(payload))).json() as Record<string, unknown>;
    const r2 = await (await wooviWebhook.fetch(signed(payload))).json() as Record<string, unknown>;
    assert.equal(r1.processed, true);
    assert.equal(r2.duplicate, true);
    assert.equal(purchases.length, 1);
    assert.equal(purchases[0].product, 'vitalicia');
    assert.equal(purchases[0].cents, price);
    assert.doesNotMatch(JSON.stringify(purchases), /@/);
  } finally { uninstall(); }
});

test('Pix de coins e Passe: purchase_done só na baixa nova (paid), não em already nem em value_mismatch', async () => {
  const items = [
    ...Object.entries(COIN_TIERS).map(([tier, p]) => ({ tier, cents: p.cents, coins: p.coins })),
    { tier: passTier(5), cents: PASS_PRICE_CENTS, coins: 0 },
  ];
  for (const p of items) {
    const corr = `ultcoins:${p.tier}:abc:${p.tier}`;
    const bad = `ultcoins:${p.tier}:bad:${p.tier}`;
    const { purchases, uninstall } = db({
      [corr]: { email: 'j@x.com', tier: p.tier, cents: p.cents, coins: p.coins, status: 'pending' },
      [bad]: { email: 'j@x.com', tier: p.tier, cents: p.cents, coins: p.coins, status: 'pending' },
    });
    try {
      await wooviWebhook.fetch(signed({ event: 'OPENPIX:CHARGE_COMPLETED', charge: { correlationID: corr, value: p.cents }, pix: { value: p.cents, endToEndId: `A-${p.tier}` } }));
      // outro evento (outra chave) do mesmo pedido já pago → 'already'
      await wooviWebhook.fetch(signed({ event: 'OPENPIX:TRANSACTION_RECEIVED', charge: { correlationID: corr, value: p.cents }, pix: { value: p.cents, endToEndId: `B-${p.tier}` } }));
      // valor errado → value_mismatch, não é venda
      await wooviWebhook.fetch(signed({ event: 'OPENPIX:CHARGE_COMPLETED', charge: { correlationID: bad, value: 1 }, pix: { value: 1, endToEndId: `C-${p.tier}` } }));
      assert.equal(purchases.length, 1, p.tier);
      assert.deepEqual(purchases[0], { product: productOfTier(p.tier), method: 'pix', cents: p.cents, ck: checkoutKey(corr), tier: p.tier });
    } finally { uninstall(); }
  }
});

test('events fora do ar: o pagamento baixa e a resposta é a mesma', async () => {
  const price = accountPriceCents();
  const corr = `ultcoins:p15:x:p15`;
  const { orders, uninstall } = db({ [corr]: { email: 'j@x.com', tier: 'p15', cents: COIN_TIERS.p15.cents, coins: COIN_TIERS.p15.coins, status: 'pending' } }, true);
  try {
    const c = await (await wooviWebhook.fetch(signed({ event: 'OPENPIX:CHARGE_COMPLETED', charge: { correlationID: corr, value: COIN_TIERS.p15.cents }, pix: { value: COIN_TIERS.p15.cents, endToEndId: 'F-1' } }))).json() as Record<string, unknown>;
    assert.deepEqual(c, { received: true, processed: true, coins: true, status: 'paid' });
    assert.equal(orders[corr].status, 'paid');
    const v = await (await wooviWebhook.fetch(signed({ event: 'OPENPIX:CHARGE_COMPLETED', charge: { correlationID: 'rtm-f@x.com-1700000000', value: price }, pix: { value: price, endToEndId: 'F-2' } }))).json() as Record<string, unknown>;
    assert.deepEqual(v, { received: true, processed: true });
  } finally { uninstall(); }
});

test('Stripe: purchase_done depois da baixa nova (coins/Passe por status paid, vitalícia por sessão nova)', () => {
  // o webhook do Stripe busca a sessão na API (retrieveCheckout), por isso a
  // ligação é conferida no código; o formato do evento é o mesmo testado acima
  const src = readFileSync(new URL('../api/stripe-webhook.ts', import.meta.url), 'utf8');
  assert.match(src, /if \(r\.status === 'paid'\) await recordPurchase\(sql, \{ provider: 'stripe', product: productOfTier\(tier\), tier, cents, corr: coinCorr \}\)/);
  assert.match(src, /ON CONFLICT \(session_id\) DO NOTHING RETURNING session_id/);
  assert.match(src, /if \(newSession\.length\) await recordPurchase\(sql, \{ provider: 'stripe', product: 'vitalicia', cents: stripePaidCents\(session\), corr: session\.id \}\)/);
  // a gravação vem DEPOIS da baixa e do número de Fundador
  assert.ok(src.indexOf("product: 'vitalicia'") > src.indexOf('await assignFounderNumbers(sql);'));
});

test('purchase_done só nasce no servidor: o /api/track do cliente recusa esse tipo', () => {
  const track = readFileSync(new URL('../api/track.ts', import.meta.url), 'utf8');
  const allow = track.slice(track.indexOf('const ALLOWED_TYPES = new Set(['), track.indexOf(']);', track.indexOf('const ALLOWED_TYPES')));
  assert.doesNotMatch(allow, /'purchase_done'/);
});
