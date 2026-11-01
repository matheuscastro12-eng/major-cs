// Pix da conta vitalícia: reabrir o modal devolve a MESMA cobrança enquanto
// ela vale (correlationID estável por janela de 24 h), em vez de criar uma
// nova a cada chamada. Expirada, perto de expirar, com preço antigo ou com erro
// na consulta: cria outra. Já paga (webhook a caminho): não cria outra.
import assert from 'node:assert/strict';
import test from 'node:test';
import account from '../api/account.js';
import { signAccountToken } from './auth.js';
import { FakeNeonHttp, type Row, type SeenQuery } from './neon-fetch.mock.js';
import {
  ACCOUNT_PIX_EXPIRES_SEC,
  ACCOUNT_PIX_MARGIN_SEC,
  ACCOUNT_PIX_WINDOW_SEC,
  accountPixChargeUse,
  accountPixCorrelations,
} from './payments.js';
import { __resetRateLimitForTests } from './rate-limit.js';
import { rtmEmailFromCorrelation } from './woovi.js';

process.env.APP_SECRET = 'test-secret';
process.env.DATABASE_URL = 'postgresql://user:pw@fake-neon.test/db';
process.env.OPENPIX_APP_ID = 'app-id-de-teste';
delete process.env.PIX_PRICE_CENTS; // preço padrão: R$ 20,00
delete process.env.STRIPE_SECRET_KEY;
delete process.env.STRIPE;

const EMAIL = 'pix@x.com';
const iso = (msFromNow: number) => new Date(Date.now() + msFromNow).toISOString();

type Charge = Record<string, unknown>;
// Woovi falso: guarda as cobranças por correlationID e responde como a API
// (GET /charge/:id aceita o correlationID; POST ?return_existing=true devolve
// a que já existe com o mesmo correlationID).
function fakeWoovi(seed: Record<string, Charge> = {}, opts: { getStatus?: number; postStatus?: number } = {}) {
  const charges = new Map<string, Charge>(Object.entries(seed));
  const posts: { returnExisting: boolean; body: Record<string, unknown> }[] = [];
  const gets: string[] = [];
  let n = 0;
  const prev = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    assert.equal(url.host, 'api.openpix.com.br', `chamada inesperada: ${url}`);
    if ((init?.method ?? 'GET') === 'GET') {
      const id = decodeURIComponent(url.pathname.replace('/api/v1/charge/', ''));
      gets.push(id);
      if (opts.getStatus) return new Response('erro', { status: opts.getStatus });
      const c = charges.get(id);
      return c ? Response.json({ charge: c }) : Response.json({ error: 'Cobrança não encontrada' }, { status: 400 });
    }
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    const returnExisting = url.searchParams.get('return_existing') === 'true';
    posts.push({ returnExisting, body });
    if (opts.postStatus) return new Response('erro', { status: opts.postStatus });
    const corr = String(body.correlationID);
    if (returnExisting && charges.has(corr)) return Response.json({ charge: charges.get(corr) });
    n += 1;
    const c: Charge = {
      correlationID: corr, value: body.value, status: 'ACTIVE', brCode: `brcode-${n}`, qrCodeImage: `qr-${n}.png`,
      paymentLinkUrl: `link-${n}`, expiresIn: body.expiresIn, expiresDate: iso(Number(body.expiresIn) * 1000), createdAt: iso(0),
    };
    charges.set(corr, c);
    return Response.json({ charge: c });
  }) as typeof fetch;
  return { charges, posts, gets, restore: () => { globalThis.fetch = prev; } };
}

function dbSetup(paid = false) {
  __resetRateLimitForTests();
  const db = new FakeNeonHttp((q: SeenQuery): Row[] => {
    if (paid && q.text.startsWith('SELECT 1 FROM rtm_paid_emails')) return [{ '?column?': 1 }];
    return [];
  });
  return { db, uninstall: db.install() };
}

async function pix() {
  const out = { code: 0, body: {} as Record<string, unknown> };
  const res = {
    status: (code: number) => ({ json: (b: unknown) => { out.code = code; out.body = b as Record<string, unknown>; } }),
    setHeader: () => {},
  };
  await account({ method: 'POST', body: { action: 'pix', token: signAccountToken(EMAIL) }, headers: {} }, res);
  return out;
}

const quiet = () => {
  const prev = console.warn;
  console.warn = () => {};
  return () => { console.warn = prev; };
};

test('correlationID estável por janela de 24 h, no formato que o webhook já lê', () => {
  const t = Date.UTC(2026, 10, 24, 15, 30);
  const a = accountPixCorrelations(EMAIL, t);
  const b = accountPixCorrelations(EMAIL, t + 3 * 3600_000); // mesma janela
  assert.deepEqual(a, b);
  const start = Math.floor(t / 1000 / ACCOUNT_PIX_WINDOW_SEC) * ACCOUNT_PIX_WINDOW_SEC;
  assert.equal(a.current, `rtm-${EMAIL}-${start}`);
  assert.equal(a.previous, `rtm-${EMAIL}-${start - ACCOUNT_PIX_WINDOW_SEC}`);
  assert.equal(rtmEmailFromCorrelation(a.current), EMAIL);
  assert.equal(rtmEmailFromCorrelation(a.previous), EMAIL);
  // a próxima janela vira a "anterior" da seguinte
  assert.equal(accountPixCorrelations(EMAIL, t + ACCOUNT_PIX_WINDOW_SEC * 1000).previous, a.current);
  // validade = janela + margem: nenhuma cobrança vive mais que 2 janelas
  assert.equal(ACCOUNT_PIX_EXPIRES_SEC, ACCOUNT_PIX_WINDOW_SEC + ACCOUNT_PIX_MARGIN_SEC);
});

test('accountPixChargeUse: aberta reaproveita; paga, expirada, perto de expirar e preço antigo não', () => {
  const now = Date.now();
  assert.deepEqual(accountPixChargeUse({ value: 2000, status: 'ACTIVE', expiresDate: iso(3600_000) }, 2000, now)?.use, 'reuse');
  assert.equal(accountPixChargeUse({ value: 2000, status: 'COMPLETED' }, 2000, now)?.use, 'paid');
  assert.equal(accountPixChargeUse({ value: 2000, status: 'EXPIRED', expiresDate: iso(-60_000) }, 2000, now)?.use, 'stale');
  assert.equal(accountPixChargeUse({ value: 2000, status: 'ACTIVE', expiresDate: iso(120_000) }, 2000, now)?.use, 'stale');
  assert.equal(accountPixChargeUse({ value: 1500, status: 'ACTIVE', expiresDate: iso(3600_000) }, 2000, now)?.use, 'stale');
  // sem expiresDate: calcula por createdAt + expiresIn
  const u = accountPixChargeUse({ value: 2000, status: 'ACTIVE', createdAt: iso(-600_000), expiresIn: 3600 }, 2000, now);
  assert.equal(u?.use, 'reuse');
  assert.ok(u && u.expiresIn > 2900 && u.expiresIn <= 3000);
  assert.equal(accountPixChargeUse({ value: 2000, status: 'ACTIVE' }, 2000, now), null);
  assert.equal(accountPixChargeUse({}, 2000, now), null);
});

test('reabrir o modal devolve a MESMA cobrança: uma só no Woovi, no preço de sempre', async () => {
  const { uninstall } = dbSetup();
  const w = fakeWoovi();
  try {
    const a = await pix();
    const b = await pix();
    assert.equal(a.code, 200);
    assert.equal(b.code, 200);
    assert.equal(a.body.brCode, 'brcode-1');
    assert.equal(b.body.brCode, 'brcode-1', 'o 2º clique devolve o mesmo copia-e-cola');
    assert.equal(w.charges.size, 1, 'uma cobrança só');
    const { current } = accountPixCorrelations(EMAIL, Date.now());
    for (const p of w.posts) {
      assert.equal(p.returnExisting, true);
      assert.equal(p.body.correlationID, current);
      assert.equal(p.body.value, 2000);
      assert.equal(p.body.comment, 'Road to Major · conta vitalícia');
      assert.equal(p.body.expiresIn, ACCOUNT_PIX_EXPIRES_SEC);
    }
    // o cliente conta o tempo a partir do que recebe: devolve o que RESTA
    assert.ok(Number(b.body.expiresIn) <= ACCOUNT_PIX_EXPIRES_SEC && Number(b.body.expiresIn) > ACCOUNT_PIX_WINDOW_SEC);
  } finally { w.restore(); uninstall(); }
});

test('cobrança da janela anterior ainda aberta é devolvida sem criar outra', async () => {
  const { uninstall } = dbSetup();
  const { previous } = accountPixCorrelations(EMAIL, Date.now());
  const w = fakeWoovi({ [previous]: { correlationID: previous, value: 2000, status: 'ACTIVE', brCode: 'brcode-ontem', qrCodeImage: 'qr-ontem.png', expiresDate: iso(2 * 3600_000) } });
  try {
    const r = await pix();
    assert.equal(r.code, 200);
    assert.equal(r.body.brCode, 'brcode-ontem');
    assert.equal(r.body.reused, true);
    assert.ok(Number(r.body.expiresIn) > 7000 && Number(r.body.expiresIn) <= 7200);
    assert.deepEqual(w.posts, [], 'nenhuma cobrança nova');
  } finally { w.restore(); uninstall(); }
});

test('expirada ou perto de expirar gera cobrança nova', async () => {
  const { uninstall } = dbSetup();
  const { previous, current } = accountPixCorrelations(EMAIL, Date.now());
  const w = fakeWoovi({ [previous]: { correlationID: previous, value: 2000, status: 'ACTIVE', brCode: 'quase', expiresDate: iso(60_000) } });
  try {
    const r = await pix();
    assert.equal(r.body.brCode, 'brcode-1');
    assert.equal(w.posts.length, 1);
    assert.equal(w.posts[0].body.correlationID, current);
  } finally { w.restore(); uninstall(); }

  // a da janela atual expirou (o Woovi encurtou a validade, por exemplo): avulsa como antes
  const s = dbSetup();
  const w2 = fakeWoovi({ [current]: { correlationID: current, value: 2000, status: 'EXPIRED', brCode: 'morta', expiresDate: iso(-60_000) } });
  const restoreWarn = quiet();
  try {
    const r = await pix();
    assert.equal(r.code, 200);
    assert.equal(r.body.brCode, 'brcode-1');
    assert.equal(w2.posts.length, 2);
    assert.equal(w2.posts[1].returnExisting, false);
    assert.match(String(w2.posts[1].body.correlationID), new RegExp(`^rtm-${EMAIL}-\\d+$`));
    assert.notEqual(w2.posts[1].body.correlationID, current);
    assert.equal(rtmEmailFromCorrelation(String(w2.posts[1].body.correlationID)), EMAIL);
  } finally { restoreWarn(); w2.restore(); s.uninstall(); }
});

test('preço mudou: cobrança aberta no preço antigo não é devolvida; a nova sai no preço do PIX_PRICE_CENTS', async () => {
  process.env.PIX_PRICE_CENTS = '2500';
  const { uninstall } = dbSetup();
  const { previous } = accountPixCorrelations(EMAIL, Date.now());
  const w = fakeWoovi({ [previous]: { correlationID: previous, value: 2000, status: 'ACTIVE', brCode: 'preco-velho', expiresDate: iso(3600_000) } });
  try {
    const r = await pix();
    assert.equal(r.body.brCode, 'brcode-1');
    assert.equal(w.posts[0].body.value, 2500);
  } finally { delete process.env.PIX_PRICE_CENTS; w.restore(); uninstall(); }
});

test('erro na consulta ao Woovi não bloqueia; erro ao criar devolve 502 como antes', async () => {
  const a = dbSetup();
  const w = fakeWoovi({}, { getStatus: 500 });
  try {
    const r = await pix();
    assert.equal(r.code, 200);
    assert.equal(r.body.brCode, 'brcode-1');
  } finally { w.restore(); a.uninstall(); }

  const b = dbSetup();
  const w2 = fakeWoovi({}, { postStatus: 500 });
  try {
    const r = await pix();
    assert.equal(r.code, 502);
  } finally { w2.restore(); b.uninstall(); }
});

test('já paga e o webhook ainda não chegou: não cria outra cobrança', async () => {
  const { uninstall } = dbSetup();
  const { previous } = accountPixCorrelations(EMAIL, Date.now());
  const w = fakeWoovi({ [previous]: { correlationID: previous, value: 2000, status: 'COMPLETED', brCode: 'paga' } });
  try {
    const r = await pix();
    assert.equal(r.code, 200);
    assert.equal(r.body.paid, false);
    assert.equal(r.body.processing, true);
    assert.deepEqual(w.posts, []);
  } finally { w.restore(); uninstall(); }
});

test('conta já paga nem fala com o Woovi', async () => {
  const { uninstall } = dbSetup(true);
  const w = fakeWoovi();
  try {
    const r = await pix();
    assert.deepEqual(r.body, { paid: true });
    assert.deepEqual(w.gets, []);
    assert.deepEqual(w.posts, []);
  } finally { w.restore(); uninstall(); }
});
