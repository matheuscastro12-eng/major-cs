// Rotas de admin contra um Neon falso (O0-16): senha em tempo constante, sessão
// de admin por conta no lugar da senha no browser, rate limit por IP e o fim do
// ?pw= na URL.
import assert from 'node:assert/strict';
import test from 'node:test';
import account from '../api/account.js';
import adminLogin from '../api/admin-login.js';
import errorRoute from '../api/error.js';
import { signAccountToken, signAdminSession } from './auth.js';
import { FakeNeonHttp, rateLimitRoute, type Row } from './neon-fetch.mock.js';
import { __resetRateLimitForTests } from './rate-limit.js';

process.env.APP_SECRET = 'test-secret';
process.env.ADMIN_PASSWORD = 'senha-mestra-forte';
process.env.DATABASE_URL = 'postgresql://user:pw@fake-neon.test/db';

const ADMINS = new Set(['boss@example.com']);

function setup() {
  __resetRateLimitForTests();
  const store = new Map<string, number>();
  const rl = rateLimitRoute(store);
  const db = new FakeNeonHttp((q): Row[] => {
    const r = rl(q);
    if (r) return r;
    if (q.text.startsWith('SELECT is_admin FROM rtm_accounts')) {
      const email = String(q.params[0]);
      return [{ is_admin: ADMINS.has(email) }];
    }
    if (q.text.startsWith('SELECT ts, kind')) return [{ ts: '2026-09-23', kind: 'error', message: 'boom' }];
    return [];
  });
  return { db, store, uninstall: db.install() };
}

type Out = { code: number; body: Record<string, unknown>; headers: Record<string, string> };
function mkRes() {
  const out: Out = { code: 0, body: {}, headers: {} };
  const res = {
    status: (code: number) => ({ json: (b: unknown) => { out.code = code; out.body = b as Record<string, unknown>; } }),
    setHeader: (k: string, v: string) => { out.headers[k] = v; },
  };
  return { out, res };
}
async function login(password: string, ip = '203.0.113.50') {
  const { out, res } = mkRes();
  await adminLogin({ method: 'POST', body: { password }, headers: { 'x-forwarded-for': ip } }, res);
  return out;
}

test('senha certa passa; errada dá 401', async () => {
  const { uninstall } = setup();
  try {
    assert.equal((await login('senha-mestra-forte')).code, 200);
    assert.equal((await login('senha-mestra-fort')).code, 401);
    assert.equal((await login('')).code, 401);
  } finally { uninstall(); }
});

test('força bruta: depois de 10 erros o IP leva 429 — inclusive com a senha certa', async () => {
  const { uninstall } = setup();
  try {
    for (let i = 0; i < 10; i++) assert.equal((await login(`chute-${i}`)).code, 401);
    const right = await login('senha-mestra-forte');
    assert.equal(right.code, 429);
    assert.ok(Number(right.headers['Retry-After']) > 0);
    // outro IP segue livre
    assert.equal((await login('senha-mestra-forte', '198.51.100.9')).code, 200);
  } finally { uninstall(); }
});

test('sessão de admin: vale pra conta is_admin, não pra conta comum nem pra token de conta', async () => {
  const { uninstall } = setup();
  try {
    assert.equal((await login(signAdminSession('boss@example.com'))).code, 200);
    assert.equal((await login(signAdminSession('player@example.com'))).code, 401); // perdeu/nunca teve is_admin
    assert.equal((await login(signAccountToken('boss@example.com'))).code, 401);
    assert.equal((await login(signAdminSession('boss@example.com', -5))).code, 401); // expirada
  } finally { uninstall(); }
});

test('adminSession entrega sessão curta ao admin e NUNCA a ADMIN_PASSWORD; adminKey morreu', async () => {
  const { uninstall } = setup();
  try {
    const call = async (body: Record<string, unknown>) => {
      const { out, res } = mkRes();
      await account({ method: 'POST', body, headers: { 'x-forwarded-for': '203.0.113.60' } }, res);
      return out;
    };
    const ok = await call({ action: 'adminSession', token: signAccountToken('boss@example.com') });
    assert.equal(ok.code, 200);
    assert.match(String(ok.body.session), /^adm\./);
    assert.ok(!JSON.stringify(ok.body).includes('senha-mestra-forte'));
    assert.equal((await call({ action: 'adminSession', token: signAccountToken('player@example.com') })).code, 403);
    const legacy = await call({ action: 'adminKey', token: signAccountToken('boss@example.com') });
    assert.equal(legacy.code, 400);
    assert.ok(!JSON.stringify(legacy.body).includes('senha-mestra-forte'));
  } finally { uninstall(); }
});

test('GET /api/error ignora ?pw= e aceita a credencial no header x-admin-key', async () => {
  const { uninstall } = setup();
  try {
    const get = async (headers: Record<string, string>, query: Record<string, string> = {}) => {
      const { out, res } = mkRes();
      await errorRoute({ method: 'GET', headers: { 'x-forwarded-for': '203.0.113.70', ...headers }, query }, res);
      return out;
    };
    assert.equal((await get({}, { pw: 'senha-mestra-forte' })).code, 401);
    assert.equal((await get({ 'x-admin-key': 'senha-mestra-forte' })).code, 200);
    assert.equal((await get({ 'x-admin-key': signAdminSession('boss@example.com') })).code, 200);
  } finally { uninstall(); }
});

test('POST /api/error: JSON quebrado dá 400 (não 500) e flood do mesmo IP dá 429', async () => {
  const { uninstall } = setup();
  try {
    const post = async (body: unknown, ip = '203.0.113.80') => {
      const { out, res } = mkRes();
      await errorRoute({ method: 'POST', body: body as string, headers: { 'x-forwarded-for': ip } }, res);
      return out;
    };
    assert.equal((await post('{quebrado')).code, 400);
    let last = 0;
    for (let i = 0; i < 25; i++) last = (await post({ message: `erro ${i}` }, '203.0.113.81')).code;
    assert.equal(last, 429);
  } finally { uninstall(); }
});
