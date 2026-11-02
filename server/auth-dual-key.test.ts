// Etapa 1 do #107: configurar APP_SECRET não desloga ninguém. Token assinado
// com o reserva legado segue valendo, o novo sai com a APP_SECRET, o `me`
// troca o antigo e a referência de pagamento não muda.
import assert from 'node:assert/strict';
import test from 'node:test';
import { accountTokenNeedsRefresh, signAccountToken, signAdminSession, verifyAccountToken, verifyAdminSession } from './auth.js';
import { accountReference } from './payments.js';

const DB = 'postgresql://user:pw@fake-neon.test/db';

function withEnv<T>(env: { APP_SECRET?: string; DATABASE_URL?: string }, fn: () => T): T {
  const prev = { a: process.env.APP_SECRET, d: process.env.DATABASE_URL };
  if (env.APP_SECRET === undefined) delete process.env.APP_SECRET; else process.env.APP_SECRET = env.APP_SECRET;
  if (env.DATABASE_URL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = env.DATABASE_URL;
  try { return fn(); } finally {
    if (prev.a === undefined) delete process.env.APP_SECRET; else process.env.APP_SECRET = prev.a;
    if (prev.d === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = prev.d;
  }
}

test('hoje (sem APP_SECRET): igual a antes, nada para trocar', () => {
  withEnv({ DATABASE_URL: DB }, () => {
    const t = signAccountToken('a@x.com');
    assert.equal(verifyAccountToken(t), 'a@x.com');
    assert.equal(accountTokenNeedsRefresh(t), false);
  });
});

test('com APP_SECRET: token antigo continua valendo e pede troca; o novo não', () => {
  const old = withEnv({ DATABASE_URL: DB }, () => signAccountToken('a@x.com'));
  const oldAdm = withEnv({ DATABASE_URL: DB }, () => signAdminSession('adm@x.com'));
  withEnv({ APP_SECRET: 'nova-chave', DATABASE_URL: DB }, () => {
    assert.equal(verifyAccountToken(old), 'a@x.com', 'ninguém é deslogado');
    assert.equal(accountTokenNeedsRefresh(old), true);
    const fresh = signAccountToken('a@x.com');
    assert.notEqual(fresh, old);
    assert.equal(verifyAccountToken(fresh), 'a@x.com');
    assert.equal(accountTokenNeedsRefresh(fresh), false);
    assert.equal(verifyAdminSession(oldAdm), 'adm@x.com');
  });
});

test('token assinado com outra chave qualquer é recusado', () => {
  const forged = withEnv({ APP_SECRET: 'chave-do-atacante', DATABASE_URL: 'postgresql://outra' }, () => signAccountToken('a@x.com'));
  withEnv({ APP_SECRET: 'nova-chave', DATABASE_URL: DB }, () => {
    assert.equal(verifyAccountToken(forged), null);
    assert.equal(accountTokenNeedsRefresh(forged), false);
  });
});

test('a referência de pagamento (stripe_ref) não muda quando a APP_SECRET entra', () => {
  const before = withEnv({ DATABASE_URL: DB }, () => accountReference('a@x.com'));
  const after = withEnv({ APP_SECRET: 'nova-chave', DATABASE_URL: DB }, () => accountReference('a@x.com'));
  assert.equal(after, before);
});

test('o me devolve o token novo e o cliente guarda', async () => {
  const { readFileSync } = await import('node:fs');
  const api = readFileSync(new URL('../api/account.ts', import.meta.url), 'utf8');
  assert.match(api, /accountTokenNeedsRefresh\(String\(body\.token \?\? ''\)\) \? \{ token: signAccountToken\(em\) \}/);
  const cli = readFileSync(new URL('../src/state/account.ts', import.meta.url), 'utf8');
  assert.match(cli, /if \(typeof raw\.token === 'string' && raw\.token\) setToken\(raw\.token\)/);
});
