// Handler de api/account.ts contra um Neon falso (neonConfig.fetchFunction):
// rate limit de login/signup/me/reset (O0-35) e o freio da reconciliação com o
// Stripe no 'me' de cadastro pendente (SEGU-09).
import assert from 'node:assert/strict';
import test from 'node:test';
import account from '../api/account.js';
import { signAccountToken } from './auth.js';
import { FakeNeonHttp, rateLimitRoute, type Row } from './neon-http.mock.js';
import { __resetRateLimitForTests } from './rate-limit.js';

process.env.APP_SECRET = 'test-secret';
process.env.DATABASE_URL = 'postgresql://user:pw@fake-neon.test/db';

function call(body: Record<string, unknown>, ip = '203.0.113.1') {
  const out = { code: 0, body: undefined as unknown as Record<string, unknown>, headers: {} as Record<string, string> };
  const res = {
    status: (code: number) => ({ json: (b: unknown) => { out.code = code; out.body = b as Record<string, unknown>; } }),
    setHeader: (k: string, v: string) => { out.headers[k] = v; },
  };
  return account({ method: 'POST', body, headers: { 'x-forwarded-for': ip } }, res).then(() => out);
}

function setup(extra: (text: string, params: unknown[]) => Row[] | undefined = () => undefined) {
  __resetRateLimitForTests();
  const store = new Map<string, number>();
  const rl = rateLimitRoute(store);
  const db = new FakeNeonHttp((q) => rl(q) ?? extra(q.text, q.params) ?? []);
  const uninstall = db.install();
  return { db, store, uninstall };
}

test('login: o 11º chute no mesmo e-mail leva 429, mesmo trocando de IP', async () => {
  const { uninstall } = setup();
  try {
    for (let i = 0; i < 10; i++) {
      const r = await call({ action: 'login', email: 'vitima@example.com', password: `chute${i}` }, `198.51.100.${i}`);
      assert.equal(r.code, 401, `tentativa ${i}`);
    }
    const blocked = await call({ action: 'login', email: 'vitima@example.com', password: 'chute-final' }, '198.51.100.99');
    assert.equal(blocked.code, 429);
    assert.ok(Number(blocked.headers['Retry-After']) > 0);
  } finally { uninstall(); }
});

test('login: credential stuffing do mesmo IP em e-mails diferentes para no limite do IP', async () => {
  const { uninstall } = setup();
  try {
    for (let i = 0; i < 30; i++) assert.equal((await call({ action: 'login', email: `u${i}@example.com`, password: 'x' })).code, 401);
    assert.equal((await call({ action: 'login', email: 'u31@example.com', password: 'x' })).code, 429);
  } finally { uninstall(); }
});

test('signup e resetRequest também têm limite por IP', async () => {
  const { uninstall } = setup();
  try {
    let last = 0;
    for (let i = 0; i < 11; i++) last = (await call({ action: 'signup', email: 'x', password: '1' }, '192.0.2.7')).code;
    assert.equal(last, 429);
    for (let i = 0; i < 11; i++) last = (await call({ action: 'resetRequest', email: `r${i}@example.com` }, '192.0.2.8')).code;
    assert.equal(last, 429);
  } finally { uninstall(); }
});

test('resetConfirm: força bruta do código para no limite por e-mail', async () => {
  const { uninstall } = setup();
  try {
    let last = 0;
    for (let i = 0; i < 11; i++) {
      last = (await call({ action: 'resetConfirm', email: 'alvo@example.com', code: String(100000 + i), password: 'nova-senha' }, `192.0.2.${20 + i}`)).code;
    }
    assert.equal(last, 429);
  } finally { uninstall(); }
});

test("me de cadastro pendente consulta o Stripe no máx. 1x por janela (não a cada request)", async () => {
  const { store, uninstall } = setup();
  const errors: unknown[][] = [];
  const origError = console.error;
  console.error = (...args: unknown[]) => { errors.push(args); };
  const prevStripe = process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_SECRET_KEY; // stripeClient() lança → loga stripe_reconciliation_failed
  try {
    const token = signAccountToken('pendente@example.com');
    for (let i = 0; i < 5; i++) await call({ action: 'me', token });
    const tries = errors.filter((e) => e[0] === 'stripe_reconciliation_failed').length;
    assert.equal(tries, 1);
    assert.equal(store.get('stripe-recon:pendente@example.com'), 5);
  } finally {
    console.error = origError;
    if (prevStripe !== undefined) process.env.STRIPE_SECRET_KEY = prevStripe;
    uninstall();
  }
});

test('me: flood do mesmo IP leva 429', async () => {
  const { uninstall } = setup();
  try {
    let last = 0;
    for (let i = 0; i < 121; i++) last = (await call({ action: 'me', token: 'lixo' }, '192.0.2.99')).code;
    assert.equal(last, 429);
  } finally { uninstall(); }
});
