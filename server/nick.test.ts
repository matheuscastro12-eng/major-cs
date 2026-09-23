import assert from 'node:assert/strict';
import test from 'node:test';
import account from '../api/account.js';
import { signAccountToken } from './auth.js';
import { FakeNeonHttp, rateLimitRoute } from './neon-fetch.mock.js';
import { accountNick, adoptNickIfMissing, nickProblem, nickSkeleton, normalizeNick } from './nick.js';
import { __resetRateLimitForTests } from './rate-limit.js';

process.env.APP_SECRET = 'test-secret';
process.env.DATABASE_URL = 'postgresql://user:pw@fake-neon.test/db';

test('normalizeNick tira invisíveis, colapsa espaço e corta em 24', () => {
  const zeroWidth = String.fromCharCode(0x200b);
  assert.equal(normalizeNick(`  cold${zeroWidth}zera  `), 'coldzera');
  assert.equal(normalizeNick('a   b'), 'a b');
  assert.equal(normalizeNick('x'.repeat(40)).length, 24);
  assert.equal(normalizeNick(undefined), '');
});

test('nickProblem: tamanho, caracteres, palavrões (com leet) e reservados', () => {
  assert.equal(nickProblem('br4z1l_zera'), null);
  assert.equal(nickProblem('FalleN'), null);
  assert.equal(nickProblem('João Kid'), null);
  assert.equal(nickProblem('cuidadoso'), null); // "cu" só bloqueia como palavra inteira
  assert.equal(nickProblem('Scunthorpe'), null);
  assert.equal(nickProblem('computador'), null);
  assert.equal(nickProblem('kkkkk sniper'), null); // risada não é KKK
  assert.ok(nickProblem('ab'));
  assert.ok(nickProblem('<script>'));
  assert.ok(nickProblem('p0rr4 louca'));
  assert.ok(nickProblem('C.a.r.a.l.h.o'));
  assert.ok(nickProblem('vai tnc'));
  assert.ok(nickProblem('fdp'));
  assert.ok(nickProblem('Admin'));
  assert.ok(nickProblem('roadtomajor_oficial'));
  assert.equal(nickSkeleton('F@ll3N'), 'fallen');
});

function setup(accounts: Record<string, string>) {
  __resetRateLimitForTests();
  const store = new Map<string, number>();
  const rl = rateLimitRoute(store);
  const updates: unknown[][] = [];
  const db = new FakeNeonHttp((q) => {
    const r = rl(q);
    if (r) return r;
    if (q.text.includes('lower(nick) = lower(')) {
      const [nick, owner] = q.params as [string, string];
      const taken = Object.entries(accounts).some(([em, n]) => n.toLowerCase() === String(nick).toLowerCase() && em !== owner);
      return taken ? [{ '?column?': 1 }] : [];
    }
    if (q.text.startsWith('UPDATE rtm_accounts SET nick=')) {
      updates.push(q.params);
      return [{ email: q.params[1] }];
    }
    if (q.text.startsWith('SELECT nick FROM rtm_accounts')) return [{ nick: accounts[String(q.params[0])] ?? null }];
    return [];
  });
  return { updates, uninstall: db.install(), sql: db };
}

async function call(body: Record<string, unknown>) {
  const out = { code: 0, body: {} as Record<string, unknown> };
  await account({ method: 'POST', body, headers: { 'x-forwarded-for': '203.0.113.5' } }, {
    status: (code: number) => ({ json: (b: unknown) => { out.code = code; out.body = b as Record<string, unknown>; } }),
    setHeader: () => {},
  });
  return out;
}

test('signup recusa nick já usado por outra conta, sem diferenciar maiúsculas', async () => {
  const { uninstall } = setup({ 'pro@example.com': 'coldzera' });
  try {
    const r = await call({ action: 'signup', email: 'fake@example.com', password: 'segredo123', nick: 'COLDZERA' });
    assert.equal(r.code, 409);
    assert.equal(r.body.field, 'nick');
    const bad = await call({ action: 'signup', email: 'fake@example.com', password: 'segredo123', nick: 'p0rra' });
    assert.equal(bad.code, 400);
  } finally { uninstall(); }
});

test('setNick troca o nick da conta com as mesmas regras', async () => {
  const { updates, uninstall } = setup({ 'pro@example.com': 'coldzera', 'me@example.com': 'velho' });
  try {
    const token = signAccountToken('me@example.com');
    assert.equal((await call({ action: 'setNick', token, nick: 'ColdZera' })).code, 409);
    assert.equal((await call({ action: 'setNick', token, nick: 'x' })).code, 400);
    const ok = await call({ action: 'setNick', token, nick: 'novo_nick' });
    assert.equal(ok.code, 200);
    assert.deepEqual(updates.at(-1), ['novo_nick', 'me@example.com']);
    assert.equal((await call({ action: 'setNick', token: 'lixo', nick: 'novo_nick' })).code, 401);
  } finally { uninstall(); }
});

test('accountNick devolve o nick do banco (nunca o do body) com fallback', async () => {
  const sql = async (_s: TemplateStringsArray, ...params: unknown[]) => (params[0] === 'a@b.com' ? [{ nick: ' ricardo ' }] : [{ nick: null }]);
  assert.equal(await accountNick(sql, 'a@b.com'), 'ricardo');
  assert.equal(await accountNick(sql, 'x@b.com'), 'manager');
});

test('adoptNickIfMissing: conta sem nick adota o do body uma vez, com as regras do signup', async () => {
  const taken = new Set(['coldzera']);
  const updates: unknown[][] = [];
  const sql = async (s: TemplateStringsArray, ...params: unknown[]) => {
    const text = s.join('?');
    if (text.includes('lower(nick)')) {
      const n = String(params[0] ?? '').toLowerCase();
      return taken.has(n) ? [{ one: 1 }] : [];
    }
    if (text.trim().startsWith('UPDATE rtm_accounts SET nick')) { updates.push(params); return [{ nick: params[0] }]; }
    return [];
  };
  assert.equal(await adoptNickIfMissing(sql, 'velho@x.com', ' Manager_Bom '), 'Manager_Bom');
  assert.deepEqual(updates.at(-1), ['Manager_Bom', 'velho@x.com']);
  // palavrão, curto demais ou nick de outra conta: não adota (fica 'manager' no ranking)
  assert.equal(await adoptNickIfMissing(sql, 'velho@x.com', 'p0rra'), '');
  assert.equal(await adoptNickIfMissing(sql, 'velho@x.com', 'x'), '');
  assert.equal(await adoptNickIfMissing(sql, 'velho@x.com', 'ColdZera'), '');
  assert.equal(updates.length, 1);
});
