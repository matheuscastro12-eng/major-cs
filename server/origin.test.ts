// [CSM-4] Origin check das mutações (economia do Ultimate e lobby).
import assert from 'node:assert/strict';
import test from 'node:test';
import { allowedOrigins, checkMutationOrigin } from './origin.js';
import economyHandler from '../api/ultimate-economy.js';
import lobbyHandler from '../api/lobby.js';

const PROD = { VERCEL_ENV: 'production' };

test('domínio oficial e www passam; site de terceiro não', () => {
  assert.deepEqual(checkMutationOrigin({ origin: 'https://roadtomajor.com.br' }, PROD), { ok: true });
  assert.deepEqual(checkMutationOrigin({ origin: 'https://www.roadtomajor.com.br' }, PROD), { ok: true });
  assert.deepEqual(checkMutationOrigin({ origin: 'https://evil.example' }, PROD), { ok: false, reason: 'origin_not_allowed' });
  // sufixo/prefixo não engana (igualdade exata de origem)
  assert.equal(checkMutationOrigin({ origin: 'https://roadtomajor.com.br.evil.example' }, PROD).ok, false);
  assert.equal(checkMutationOrigin({ origin: 'http://roadtomajor.com.br' }, PROD).ok, false);
  assert.equal(checkMutationOrigin({ origin: 'lixo' }, PROD).ok, false);
});

test('preview da Vercel, APP_ORIGINS e mesma origem do Host passam', () => {
  const env = { ...PROD, VERCEL_URL: 'roadtomajor-abc123.vercel.app', APP_ORIGINS: 'https://beta.roadtomajor.com.br, https://outro.exemplo/' };
  assert.ok(allowedOrigins(env).has('https://roadtomajor-abc123.vercel.app'));
  assert.ok(checkMutationOrigin({ origin: 'https://roadtomajor-abc123.vercel.app' }, env).ok);
  assert.ok(checkMutationOrigin({ origin: 'https://beta.roadtomajor.com.br' }, env).ok);
  assert.ok(checkMutationOrigin({ origin: 'https://outro.exemplo' }, env).ok);
  assert.ok(checkMutationOrigin({ origin: 'https://custom.dominio', host: 'custom.dominio' }, PROD).ok);
  assert.equal(checkMutationOrigin({ origin: 'https://custom.dominio', host: 'outro.dominio' }, PROD).ok, false);
});

test('localhost só fora de produção', () => {
  assert.equal(checkMutationOrigin({ origin: 'http://localhost:5173' }, PROD).ok, false);
  assert.ok(checkMutationOrigin({ origin: 'http://localhost:5173' }, { VERCEL_ENV: 'development' }).ok);
});

test('sem Origin: passa por padrão, cross-site recusa, ORIGIN_REQUIRE=1 exige', () => {
  assert.ok(checkMutationOrigin({}, PROD).ok);
  assert.deepEqual(checkMutationOrigin({ 'sec-fetch-site': 'cross-site' }, PROD), { ok: false, reason: 'cross_site' });
  assert.deepEqual(checkMutationOrigin({}, { ...PROD, ORIGIN_REQUIRE: '1' }), { ok: false, reason: 'origin_missing' });
});

function res() {
  const out = { status: 0, body: null as unknown };
  return {
    out,
    r: {
      status(code: number) { out.status = code; return { json(b: unknown) { out.body = b; } }; },
      setHeader() { /* noop */ },
    },
  };
}

test('rotas: economia e lobby recusam POST de origem estranha com 403 antes do banco', async () => {
  const prev = { e: process.env.VERCEL_ENV, d: process.env.DATABASE_URL, s: process.env.APP_SECRET };
  process.env.VERCEL_ENV = 'production';
  process.env.DATABASE_URL = 'postgres://nunca-usado';
  process.env.APP_SECRET = process.env.APP_SECRET || 'x'.repeat(40);
  try {
    const a = res();
    await economyHandler({ method: 'POST', headers: { origin: 'https://evil.example' }, body: { action: 'state' } }, a.r);
    assert.equal(a.out.status, 403);
    const b = res();
    await lobbyHandler({ method: 'POST', headers: { origin: 'https://evil.example' }, body: { action: 'create' } }, b.r as never);
    assert.equal(b.out.status, 403);
  } finally {
    for (const [k, v] of [['VERCEL_ENV', prev.e], ['DATABASE_URL', prev.d], ['APP_SECRET', prev.s]] as const) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
});
