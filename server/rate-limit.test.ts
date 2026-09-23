import assert from 'node:assert/strict';
import test from 'node:test';
import {
  __resetRateLimitForTests,
  clientIp,
  rateLimitHit,
  rateLimitPeek,
  respondLimited,
} from './rate-limit.js';
import { FakeRateDb } from './rate-limit.mock.js';

test('bloqueia a partir do limite+1 dentro da janela e reabre quando ela vence', async () => {
  __resetRateLimitForTests();
  const db = new FakeRateDb();
  const rule = { key: 'login:ip:1.1.1.1', limit: 3, windowSec: 60 };
  for (let i = 0; i < 3; i++) assert.equal((await rateLimitHit(db.sql, [rule])).limited, false);
  const blocked = await rateLimitHit(db.sql, [rule]);
  assert.equal(blocked.limited, true);
  assert.equal(blocked.key, rule.key);
  assert.ok(blocked.retryAfterSec > 0 && blocked.retryAfterSec <= 60);
  db.now += 61_000;
  assert.equal((await rateLimitHit(db.sql, [rule])).limited, false);
});

test('várias regras num round-trip só: estoura se QUALQUER uma estourar', async () => {
  __resetRateLimitForTests();
  const db = new FakeRateDb();
  const ip = (n: number) => ({ key: `login:ip:9.9.9.${n}`, limit: 100, windowSec: 900 });
  const email = { key: 'login:email:vitima@example.com', limit: 2, windowSec: 900 };
  assert.equal((await rateLimitHit(db.sql, [ip(1), email])).limited, false);
  assert.equal((await rateLimitHit(db.sql, [ip(2), email])).limited, false);
  // IP novo (ataque distribuído), mas o e-mail já estourou
  const d = await rateLimitHit(db.sql, [ip(3), email]);
  assert.equal(d.limited, true);
  assert.equal(d.key, email.key);
  const inserts = db.queries.filter((q) => q.startsWith('INSERT'));
  assert.equal(inserts.length, 3); // 1 statement por checagem, não 1 por regra
});

test('o contador é compartilhado: duas "instâncias" batem no mesmo banco', async () => {
  __resetRateLimitForTests();
  const db = new FakeRateDb();
  const rule = { key: 'signup:ip:5.5.5.5', limit: 2, windowSec: 3600 };
  await rateLimitHit(db.sql, [rule]);
  __resetRateLimitForTests(); // outra instância: memória zerada, banco igual
  await rateLimitHit(db.sql, [rule]);
  __resetRateLimitForTests();
  assert.equal((await rateLimitHit(db.sql, [rule])).limited, true);
});

test('peek não conta e barra quem já chegou no limite', async () => {
  __resetRateLimitForTests();
  const db = new FakeRateDb();
  const rule = { key: 'admin-fail:ip:6.6.6.6', limit: 2, windowSec: 900 };
  assert.equal((await rateLimitPeek(db.sql, [rule])).limited, false);
  await rateLimitHit(db.sql, [rule]);
  assert.equal((await rateLimitPeek(db.sql, [rule])).limited, false);
  await rateLimitHit(db.sql, [rule]);
  assert.equal((await rateLimitPeek(db.sql, [rule])).limited, true);
  assert.equal(db.rows.get(rule.key)?.count, 2); // peek não incrementou
});

test('banco fora do ar: cai no limitador em memória (não derruba a rota)', async () => {
  __resetRateLimitForTests();
  const db = new FakeRateDb();
  db.fail = true;
  const rule = { key: 'me:ip:7.7.7.7', limit: 1, windowSec: 60 };
  assert.equal((await rateLimitHit(db.sql, [rule])).limited, false);
  assert.equal((await rateLimitHit(db.sql, [rule])).limited, true);
  assert.equal((await rateLimitPeek(db.sql, [rule])).limited, false); // peek falha aberto
});

test('sem sql (null) usa a memória da instância', async () => {
  __resetRateLimitForTests();
  const rule = { key: 'track:ip:8.8.8.8', limit: 2, windowSec: 60 };
  assert.equal((await rateLimitHit(null, [rule])).limited, false);
  assert.equal((await rateLimitHit(null, [rule])).limited, false);
  assert.equal((await rateLimitHit(null, [rule])).limited, true);
  assert.equal((await rateLimitPeek(null, [rule])).limited, true);
});

test('respondLimited devolve 429 com Retry-After', () => {
  const out = { code: 0, body: null as unknown, headers: {} as Record<string, string> };
  const res = {
    status: (c: number) => ({ json: (b: unknown) => { out.code = c; out.body = b; } }),
    setHeader: (k: string, v: string) => { out.headers[k] = v; },
  };
  assert.equal(respondLimited(res, { limited: false, retryAfterSec: 0 }), false);
  assert.equal(out.code, 0);
  assert.equal(respondLimited(res, { limited: true, retryAfterSec: 42 }), true);
  assert.equal(out.code, 429);
  assert.equal(out.headers['Retry-After'], '42');
});

test('clientIp pega o primeiro IP do x-forwarded-for', () => {
  assert.equal(clientIp({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1' }), '1.2.3.4');
  assert.equal(clientIp({ 'x-real-ip': '5.6.7.8' }), '5.6.7.8');
  assert.equal(clientIp({}), 'unknown');
});
