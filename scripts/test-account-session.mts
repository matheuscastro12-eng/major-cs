// [O0-10/O1-33] Sessão da conta: o token só morre num 401 explícito; rede e 5xx
// mantêm o token e o Account em cache; o /me é deduplicado na store única.
import test from 'node:test';
import assert from 'node:assert/strict';

// localStorage + fetch fakes ANTES de importar o módulo (a store lê o token no load)
const mem = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => { mem.set(k, String(v)); },
  removeItem: (k: string) => { mem.delete(k); },
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
};
const TOKEN = 'rtm-acct-token-v1';
const CACHE = 'rtm-acct-cache-v1';
const PAID = { email: 'a@b.c', nick: 'pro', paid: true, founder: false, founderNo: null, admin: false };
mem.set(TOKEN, 'tok');
mem.set(CACHE, JSON.stringify(PAID));

type Reply = { status: number; body?: unknown } | 'network';
let queue: Reply[] = [];
let calls = 0;
(globalThis as Record<string, unknown>).fetch = async () => {
  calls++;
  const r = queue.shift() ?? 'network';
  if (r === 'network') throw new TypeError('Failed to fetch');
  return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body ?? {} } as Response;
};

const acct = await import('../src/state/account.ts');

test('boot com token: começa em checking com o Account em cache (sem flash de grátis)', () => {
  const s = acct.useAccountStore.getState();
  assert.equal(s.status, 'checking');
  assert.equal(s.ready, false);
  assert.equal(s.account?.paid, true);
});

test('só 401 é "não autorizado"; rede, 429 e 5xx são offline', () => {
  assert.equal(acct.meFailureKind(401), 'unauthorized');
  for (const st of [0, 400, 404, 429, 500, 502, 503]) assert.equal(acct.meFailureKind(st), 'offline');
});

test('5xx do /me mantém o token e devolve o Account em cache (status offline)', async () => {
  queue = [{ status: 500, body: { error: 'neon caiu' } }];
  const me = await acct.fetchMe();
  assert.equal(me?.paid, true);
  assert.equal(mem.get(TOKEN), 'tok');
  const s = acct.useAccountStore.getState();
  assert.equal(s.status, 'offline');
  assert.equal(s.ready, true);
});

test('rede caída no meio do polling do Pix: o token fica e o próximo poll confirma', async () => {
  mem.set(CACHE, JSON.stringify({ ...PAID, paid: false })); // ainda grátis no cache
  queue = ['network', { status: 200, body: PAID }];
  const first = await acct.fetchMe();
  assert.equal(first?.paid, false, 'offline: vale o cache (grátis), o polling segue');
  assert.equal(mem.get(TOKEN), 'tok', 'token NÃO pode sumir numa queda de rede');
  const second = await acct.fetchMe();
  assert.equal(second?.paid, true, 'a rede voltou: o pagamento confirma');
  assert.equal(acct.useAccountStore.getState().status, 'online');
  assert.equal(JSON.parse(mem.get(CACHE)!).paid, true, 'cache atualizado com o /me bom');
});

test('/me concorrentes dividem uma requisição só', async () => {
  calls = 0;
  queue = [{ status: 200, body: PAID }];
  const [a, b, c] = await Promise.all([acct.refreshAccount(), acct.fetchMe(), acct.refreshAccount()]);
  assert.equal(calls, 1);
  assert.deepEqual(a, b);
  assert.deepEqual(b, c);
});

test('401 explícito apaga token e cache e vira anon', async () => {
  queue = [{ status: 401, body: { error: 'Sessão inválida' } }];
  const me = await acct.fetchMe();
  assert.equal(me, null);
  assert.equal(mem.has(TOKEN), false);
  assert.equal(mem.has(CACHE), false);
  assert.equal(acct.useAccountStore.getState().status, 'anon');
});

test('sem token o /me nem sai (anon imediato)', async () => {
  calls = 0;
  const me = await acct.fetchMe();
  assert.equal(me, null);
  assert.equal(calls, 0);
});

test('logout global limpa token, cache e a store', () => {
  mem.set(TOKEN, 'tok2');
  acct.setAccount(PAID);
  assert.equal(acct.useAccountStore.getState().account?.paid, true);
  acct.logoutAccount();
  assert.equal(mem.has(TOKEN), false);
  assert.equal(mem.has(CACHE), false);
  assert.equal(acct.useAccountStore.getState().account, null);
});
