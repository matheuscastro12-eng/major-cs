// Endurecimento de pagamento (O0-40, O0-41, O0-42): success_url só pra origin
// conhecido, cobrança pendente do passe reaproveitada e número de Fundador que
// nunca é renumerado.
import assert from 'node:assert/strict';
import test from 'node:test';
import account from '../api/account.js';
import adminAccounts from '../api/admin-accounts.js';
import { signAccountToken, signAdminSession } from './auth.js';
import { FakeNeonHttp, rateLimitRoute, type Row, type SeenQuery } from './neon-fetch.mock.js';
import { assignFounderNumbers, checkoutBase, OFFICIAL_ORIGIN } from './payments.js';
import { __resetRateLimitForTests } from './rate-limit.js';
import { neon } from '@neondatabase/serverless';

process.env.APP_SECRET = 'test-secret';
process.env.DATABASE_URL = 'postgresql://user:pw@fake-neon.test/db';
process.env.OPENPIX_APP_ID = 'app-id-de-teste';
process.env.ADMIN_PASSWORD = 'senha-mestra-forte';

type Out = { code: number; body: Record<string, unknown> };
function mkRes() {
  const out: Out = { code: 0, body: {} };
  const res = {
    status: (code: number) => ({ json: (b: unknown) => { out.code = code; out.body = b as Record<string, unknown>; } }),
    setHeader: () => {},
  };
  return { out, res };
}

test('checkoutBase: só origin conhecido; o resto cai no domínio oficial', () => {
  const prev = { o: process.env.APP_ORIGINS, u: process.env.VERCEL_URL, e: process.env.VERCEL_ENV };
  try {
    delete process.env.APP_ORIGINS; delete process.env.VERCEL_URL; process.env.VERCEL_ENV = 'production';
    assert.equal(checkoutBase('https://roadtomajor.com.br'), OFFICIAL_ORIGIN);
    assert.equal(checkoutBase('https://www.roadtomajor.com.br/'), 'https://www.roadtomajor.com.br');
    // o golpe do ECON-11: qualquer https servia (a regex nem tinha âncora no fim)
    assert.equal(checkoutBase('https://roadtomajor-premio.com'), OFFICIAL_ORIGIN);
    assert.equal(checkoutBase('https://roadtomajor.com.br.golpe.io'), OFFICIAL_ORIGIN);
    assert.equal(checkoutBase('https://roadtomajor.com.br@golpe.io'), OFFICIAL_ORIGIN);
    assert.equal(checkoutBase('javascript:alert(1)'), OFFICIAL_ORIGIN);
    assert.equal(checkoutBase(undefined), OFFICIAL_ORIGIN);
    assert.equal(checkoutBase('http://localhost:5173'), OFFICIAL_ORIGIN); // produção: nem localhost
    // path/query nunca passam: só a origem
    assert.equal(checkoutBase('https://roadtomajor.com.br/x?y=1'), OFFICIAL_ORIGIN);

    process.env.APP_ORIGINS = 'https://beta.roadtomajor.com.br, https://outro.exemplo/';
    process.env.VERCEL_URL = 'roadtomajor-abc123.vercel.app';
    assert.equal(checkoutBase('https://beta.roadtomajor.com.br'), 'https://beta.roadtomajor.com.br');
    assert.equal(checkoutBase('https://outro.exemplo'), 'https://outro.exemplo');
    assert.equal(checkoutBase('https://roadtomajor-abc123.vercel.app'), 'https://roadtomajor-abc123.vercel.app');
    assert.equal(checkoutBase('https://roadtomajor-OUTRO.vercel.app'), OFFICIAL_ORIGIN);
    process.env.VERCEL_ENV = 'development';
    assert.equal(checkoutBase('http://localhost:5173'), 'http://localhost:5173');
  } finally {
    for (const [k, v] of [['APP_ORIGINS', prev.o], ['VERCEL_URL', prev.u], ['VERCEL_ENV', prev.e]] as const) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
});

// ── O0-41: passe ────────────────────────────────────────────────────────────
function passSetup(reusable: Row | null) {
  __resetRateLimitForTests();
  const db = new FakeNeonHttp((q: SeenQuery): Row[] => {
    if (q.text.startsWith('SELECT correlation_id, pay_ref')) return reusable ? [reusable] : [];
    return [];
  });
  return { db, uninstall: db.install() };
}

function stubFetch(impl: (url: string) => Response) {
  const prev = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push(url);
    return impl(url);
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = prev; } };
}

test('passPix com Pix aberto da mesma temporada devolve a MESMA cobrança, sem criar outra', async () => {
  const { db, uninstall } = passSetup({
    correlation_id: 'ultcoins:pass-s4:abc:def',
    pay_ref: JSON.stringify({ qrCodeImage: 'https://api.openpix.com.br/qr/1.png', brCode: '000201-brcode', paymentLinkUrl: null }),
    left_sec: 1800,
  });
  const f = stubFetch(() => { throw new Error('não devia chamar o Woovi'); });
  try {
    const { out, res } = mkRes();
    await account({ method: 'POST', body: { action: 'passPix', token: signAccountToken('p@x.com'), season: 4 }, headers: {} }, res);
    assert.equal(out.code, 200);
    assert.equal(out.body.brCode, '000201-brcode');
    assert.equal(out.body.correlationID, 'ultcoins:pass-s4:abc:def');
    assert.equal(out.body.reused, true);
    assert.deepEqual(f.calls, []);
    assert.ok(!db.texts().some((t) => t.startsWith('INSERT INTO rtm_coin_orders')));
  } finally { f.restore(); uninstall(); }
});

test('passPix sem cobrança aberta cria o pedido e guarda o QR pra reaproveitar', async () => {
  const { db, uninstall } = passSetup(null);
  const f = stubFetch(() => Response.json({ charge: { brCode: 'novo-brcode', qrCodeImage: 'qr.png', paymentLinkUrl: 'link', expiresIn: 900 } }));
  try {
    const { out, res } = mkRes();
    await account({ method: 'POST', body: { action: 'passPix', token: signAccountToken('p@x.com'), season: 4 }, headers: {} }, res);
    assert.equal(out.code, 200);
    assert.equal(out.body.brCode, 'novo-brcode');
    assert.equal(f.calls.length, 1);
    const remember = db.seen.find((q) => q.text.startsWith('UPDATE rtm_coin_orders SET pay_ref'));
    assert.ok(remember, 'pay_ref gravado');
    assert.match(String(remember.params[0]), /novo-brcode/);
    assert.equal(Number(remember.params[1]), 900);
  } finally { f.restore(); uninstall(); }
});

test('passCheckout com sessão de cartão aberta devolve a mesma URL (não cria 2ª sessão na Stripe)', async () => {
  const { uninstall } = passSetup({ correlation_id: 'ultcoins:pass-s4:x:y', pay_ref: JSON.stringify({ url: 'https://checkout.stripe.com/c/pay/cs_1' }), left_sec: 80000 });
  try {
    const { out, res } = mkRes();
    await account({ method: 'POST', body: { action: 'passCheckout', token: signAccountToken('p@x.com'), season: 4 }, headers: {} }, res);
    assert.equal(out.code, 200);
    assert.equal(out.body.url, 'https://checkout.stripe.com/c/pay/cs_1');
    assert.equal(out.body.reused, true);
  } finally { uninstall(); }
});

// ── O0-42: Fundador ─────────────────────────────────────────────────────────
test('assignFounderNumbers só preenche quem está sem número, sob lock, e deixa grant de admin fora', async () => {
  const db = new FakeNeonHttp();
  const uninstall = db.install();
  try {
    await assignFounderNumbers(neon(process.env.DATABASE_URL as string), 500);
    const [lock, assign, restore] = db.texts();
    assert.match(lock, /pg_advisory_xact_lock/);
    assert.match(assign, /founder_no IS NULL/);
    assert.match(assign, /payment_method, ''\) <> 'admin'/);
    assert.match(assign, /COALESCE\(MAX\(founder_no\), 0\)/);
    // nada de row_number sobre TODOS os pagos reescrevendo founder_no de quem já tem
    assert.doesNotMatch(assign, /IS DISTINCT FROM/);
    assert.match(restore, /founder_no IS NOT NULL/);
    assert.equal(Number(db.seen[1].params[0]), 500);
  } finally { uninstall(); }
});

function adminSetup() {
  __resetRateLimitForTests();
  const store = new Map<string, number>();
  const rl = rateLimitRoute(store);
  const db = new FakeNeonHttp((q): Row[] => {
    const r = rl(q);
    if (r) return r;
    if (q.text.startsWith('SELECT is_admin FROM rtm_accounts')) return [{ is_admin: true }];
    return [];
  });
  return { db, uninstall: db.install() };
}

test('grant do admin não consome vaga (sem MAX+1 direto) e revoke aposenta o número sem renumerar', async () => {
  const { db, uninstall } = adminSetup();
  const admin = signAdminSession('boss@example.com');
  try {
    const g = mkRes();
    await adminAccounts({ method: 'POST', body: { action: 'grant', password: admin, email: 'amigo@x.com' }, headers: {} }, g.res);
    assert.equal(g.out.code, 200);
    const texts = db.texts();
    assert.ok(!texts.some((t) => /founder_no=\(SELECT COALESCE\(MAX/.test(t)), 'o grant não atribui número direto');
    assert.ok(texts.some((t) => t.includes("payment_method, 'admin')")));

    db.seen.length = 0;
    const r = mkRes();
    await adminAccounts({ method: 'POST', body: { action: 'revoke', password: admin, email: 'amigo@x.com' }, headers: {} }, r.res);
    assert.equal(r.out.code, 200);
    const revoke = db.texts().find((t) => t.startsWith('UPDATE rtm_accounts SET paid=false'));
    assert.ok(revoke && revoke.includes('is_founder=false'));
    assert.ok(!db.texts().some((t) => /row_number\(\)/.test(t)), 'revoke não renumera ninguém');
  } finally { uninstall(); }
});
