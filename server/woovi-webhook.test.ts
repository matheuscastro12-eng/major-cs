// Webhook do Woovi contra um Neon falso (O0-24, O0-41): vitalícia só com
// cobrança "rtm-" e valor cheio, e-mail do correlationID, pedido só com valor
// igual, passe pago 2× vira 'duplicate' e o mesmo Pix não processa duas vezes.
import assert from 'node:assert/strict';
import { createSign, generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import wooviWebhook from '../api/woovi-webhook.js';
import { FakeNeonHttp, type Row, type SeenQuery } from './neon-fetch.mock.js';
import { isPaidEvent, rtmEmailFromCorrelation, wooviCorrelation, wooviPaidCents, wooviPaymentKey } from './woovi.js';

process.env.APP_SECRET = 'test-secret';
process.env.DATABASE_URL = 'postgresql://user:pw@fake-neon.test/db';
delete process.env.PIX_PRICE_CENTS; // preço padrão: R$ 20,00

// par de chaves de teste no lugar da chave pública do Woovi (override por env)
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 1024 });
process.env.WOOVI_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }).toString();

function signed(payload: unknown): Request {
  const raw = JSON.stringify(payload);
  const s = createSign('sha256');
  s.update(raw);
  s.end();
  return new Request('https://example.com/api/woovi-webhook', {
    method: 'POST',
    headers: { 'x-webhook-signature': s.sign(privateKey, 'base64') },
    body: raw,
  });
}

interface Order { email: string; tier: string; cents: number; coins: number; status: string }

// "banco": pedidos, chaves de idempotência e e-mails pagos. O roteador emula as
// queries do webhook (a regra de status espelha o CASE de server/order-settle.ts).
function setup(orders: Record<string, Order> = {}) {
  const events = new Set<string>();
  const paidEmails: string[] = [];
  const db = new FakeNeonHttp((q: SeenQuery): Row[] => {
    const t = q.text;
    if (t.startsWith('INSERT INTO rtm_webhook_events')) {
      const key = String(q.params[0]);
      if (events.has(key)) return [];
      events.add(key);
      return [{ event_key: key }];
    }
    if (t.startsWith('DELETE FROM rtm_webhook_events')) { events.delete(String(q.params[0])); return []; }
    if (t.startsWith('UPDATE rtm_coin_orders o SET')) {
      const [paid, method, corr] = q.params as [string, string, string];
      const o = orders[corr];
      if (!o || o.status !== 'pending') return [];
      const dup = o.tier.startsWith('pass-s') && Object.entries(orders)
        .some(([c, d]) => c !== corr && d.email === o.email && d.tier === o.tier && (d.status === 'paid' || d.status === 'claimed'));
      o.status = o.cents !== Number(paid) ? 'value_mismatch' : dup ? 'duplicate' : 'paid';
      void method;
      return [{ status: o.status, email: o.email, tier: o.tier }];
    }
    if (t.startsWith('SELECT status, email, tier FROM rtm_coin_orders')) {
      const o = orders[String(q.params[0])];
      return o ? [{ status: o.status, email: o.email, tier: o.tier }] : [];
    }
    if (t.startsWith('INSERT INTO rtm_paid_emails')) { paidEmails.push(String(q.params[0])); return []; }
    return [];
  });
  return { db, orders, events, paidEmails, uninstall: db.install() };
}

async function post(payload: unknown) {
  const r = await wooviWebhook.fetch(signed(payload));
  return { status: r.status, body: await r.json() as Record<string, unknown> };
}

const quiet = () => {
  const prev = { warn: console.warn, error: console.error };
  const lines: string[] = [];
  console.warn = (...a: unknown[]) => { lines.push(a.map(String).join(' ')); };
  console.error = (...a: unknown[]) => { lines.push(a.map(String).join(' ')); };
  return { lines, restore: () => { console.warn = prev.warn; console.error = prev.error; } };
};

test('parsers: correlationID, valor, chave do pagamento e e-mail do rtm-', () => {
  const body = { event: 'OPENPIX:TRANSACTION_RECEIVED', pix: { value: 2000, endToEndId: 'E123', charge: { correlationID: 'rtm-a-b@x.com-1700000000' } } };
  assert.equal(isPaidEvent(body), true);
  assert.equal(wooviCorrelation(body), 'rtm-a-b@x.com-1700000000');
  assert.equal(wooviPaidCents(body), 2000);
  assert.equal(wooviPaymentKey(body), 'E123');
  // e-mail com '-' e corte no último '-'
  assert.equal(rtmEmailFromCorrelation('rtm-a-b@x.com-1700000000'), 'a-b@x.com');
  assert.equal(rtmEmailFromCorrelation('rtm-A@X.com-1'), 'a@x.com');
  assert.equal(rtmEmailFromCorrelation('rtm-a@x.com'), '');
  assert.equal(rtmEmailFromCorrelation('rtm-naoemail-123'), '');
  assert.equal(rtmEmailFromCorrelation('ultcoins:p10:x:y'), '');
  assert.ok(Number.isNaN(wooviPaidCents({ event: 'x' })));
});

test('Pix avulso (sem cobrança nossa) com e-mail do pagador NÃO vira vitalícia', async () => {
  const { paidEmails, events, uninstall } = setup();
  const log = quiet();
  try {
    const r = await post({ event: 'OPENPIX:TRANSACTION_RECEIVED', pix: { value: 5000, endToEndId: 'E-avulso', payer: { email: 'alguem@x.com' } } });
    assert.equal(r.status, 200);
    assert.equal(r.body.processed, false);
    assert.deepEqual(paidEmails, []);
    // chave liberada: se o mesmo Pix chegar depois com a cobrança, processa
    assert.equal(events.has('E-avulso'), false);
  } finally { log.restore(); uninstall(); }
});

test('vitalícia: valor abaixo do preço não ativa; valor cheio ativa o e-mail do correlationID, não o do pagador', async () => {
  const { paidEmails, uninstall } = setup();
  const log = quiet();
  try {
    const low = await post({ event: 'OPENPIX:CHARGE_COMPLETED', charge: { correlationID: 'rtm-dono@x.com-1700000000', value: 1000, customer: { email: 'outro@x.com' } }, pix: { value: 1000, endToEndId: 'E-low' } });
    assert.equal(low.body.processed, false);
    assert.deepEqual(paidEmails, []);
    // cobrança de coins (R$ 10) com o prefixo da vitalícia não libera a conta de R$ 20
    assert.ok(log.lines.some((l) => l.includes('abaixo do preço')));

    const ok = await post({ event: 'OPENPIX:CHARGE_COMPLETED', charge: { correlationID: 'rtm-dono@x.com-1700000001', value: 2000, customer: { email: 'outro@x.com' } }, pix: { value: 2000, endToEndId: 'E-ok' } });
    assert.equal(ok.body.processed, true);
    assert.deepEqual(paidEmails, ['dono@x.com']);
  } finally { log.restore(); uninstall(); }
});

test('mesmo Pix entregue 2× (CHARGE_COMPLETED + TRANSACTION_RECEIVED) processa uma vez só', async () => {
  const { paidEmails, db, uninstall } = setup();
  try {
    const charge = { correlationID: 'rtm-dono@x.com-1700000000', value: 2000 };
    const a = await post({ event: 'OPENPIX:CHARGE_COMPLETED', charge, pix: { value: 2000, endToEndId: 'E-dup' } });
    const b = await post({ event: 'OPENPIX:TRANSACTION_RECEIVED', pix: { value: 2000, endToEndId: 'E-dup', charge } });
    assert.equal(a.body.processed, true);
    assert.equal(b.body.duplicate, true);
    assert.deepEqual(paidEmails, ['dono@x.com']);
    assert.equal(db.texts().filter((t) => t.startsWith('INSERT INTO rtm_paid_emails')).length, 1);
  } finally { uninstall(); }
});

test('pedido de coins: valor igual paga; valor diferente vira value_mismatch e não credita', async () => {
  const { orders, uninstall } = setup({
    'ultcoins:p10:a:1': { email: 'p@x.com', tier: 'p10', cents: 1000, coins: 30000, status: 'pending' },
    'ultcoins:p30:a:2': { email: 'p@x.com', tier: 'p30', cents: 3000, coins: 120000, status: 'pending' },
  });
  const log = quiet();
  try {
    const ok = await post({ event: 'OPENPIX:CHARGE_COMPLETED', charge: { correlationID: 'ultcoins:p10:a:1', value: 1000 }, pix: { value: 1000, endToEndId: 'E-c1' } });
    assert.equal(ok.body.status, 'paid');
    assert.equal(orders['ultcoins:p10:a:1'].status, 'paid');

    const bad = await post({ event: 'OPENPIX:CHARGE_COMPLETED', charge: { correlationID: 'ultcoins:p30:a:2', value: 3000 }, pix: { value: 100, endToEndId: 'E-c2' } });
    assert.equal(bad.body.status, 'value_mismatch');
    assert.equal(bad.body.processed, false);
    assert.equal(orders['ultcoins:p30:a:2'].status, 'value_mismatch');
    assert.ok(log.lines.some((l) => l.includes('value_mismatch') && l.includes('reembolsar')));
  } finally { log.restore(); uninstall(); }
});

test('passe: segundo pedido pago da mesma temporada vira duplicate (não religa nada, vai pro CRM)', async () => {
  const { orders, uninstall } = setup({
    'ultcoins:pass-s3:a:1': { email: 'p@x.com', tier: 'pass-s3', cents: 3000, coins: 0, status: 'pending' },
    'ultcoins:pass-s3:a:2': { email: 'p@x.com', tier: 'pass-s3', cents: 3000, coins: 0, status: 'pending' },
  });
  const log = quiet();
  try {
    await post({ event: 'OPENPIX:CHARGE_COMPLETED', charge: { correlationID: 'ultcoins:pass-s3:a:1', value: 3000 }, pix: { value: 3000, endToEndId: 'E-p1' } });
    const second = await post({ event: 'OPENPIX:CHARGE_COMPLETED', charge: { correlationID: 'ultcoins:pass-s3:a:2', value: 3000 }, pix: { value: 3000, endToEndId: 'E-p2' } });
    assert.equal(orders['ultcoins:pass-s3:a:1'].status, 'paid');
    assert.equal(orders['ultcoins:pass-s3:a:2'].status, 'duplicate');
    assert.equal(second.body.status, 'duplicate');
  } finally { log.restore(); uninstall(); }
});

test('falha no meio do processamento libera a chave (a re-entrega do Woovi processa de novo)', async () => {
  const events = new Set<string>();
  let fail = true;
  const db = new FakeNeonHttp((q): Row[] => {
    if (q.text.startsWith('INSERT INTO rtm_webhook_events')) {
      const key = String(q.params[0]);
      if (events.has(key)) return [];
      events.add(key);
      return [{ event_key: key }];
    }
    if (q.text.startsWith('DELETE FROM rtm_webhook_events')) { events.delete(String(q.params[0])); return []; }
    if (q.text.startsWith('INSERT INTO rtm_paid_emails') && fail) throw new Error('neon caiu');
    return [];
  });
  const uninstall = db.install();
  try {
    const payload = { event: 'OPENPIX:CHARGE_COMPLETED', charge: { correlationID: 'rtm-dono@x.com-1700000000', value: 2000 }, pix: { value: 2000, endToEndId: 'E-retry' } };
    await assert.rejects(() => wooviWebhook.fetch(signed(payload)));
    assert.equal(events.has('E-retry'), false);
    fail = false;
    const r = await post(payload);
    assert.equal(r.body.processed, true);
  } finally { uninstall(); }
});

test('assinatura inválida continua 401', async () => {
  const { uninstall } = setup();
  try {
    const r = await wooviWebhook.fetch(new Request('https://example.com/api/woovi-webhook', {
      method: 'POST', headers: { 'x-webhook-signature': 'AAAA' }, body: JSON.stringify({ event: 'OPENPIX:CHARGE_COMPLETED' }),
    }));
    assert.equal(r.status, 401);
  } finally { uninstall(); }
});
