// [ULT-ON] o erro transitório do 1º matchStart não pisca mais na tela.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pollErrorVisible, isTransientPollStatus, PVP_TRANSIENT_FAILS_BEFORE_ERROR } from '../src/state/pvpPoll.js';

test('500/503/409/429/rede são transitórios; 403/404/400 não', () => {
  for (const s of [500, 502, 503, 409, 429, null]) assert.equal(isTransientPollStatus(s), true, String(s));
  for (const s of [400, 401, 403, 404]) assert.equal(isTransientPollStatus(s), false, String(s));
});

test('um 500 isolado no matchStart não vira mensagem; falhas seguidas sim', () => {
  assert.equal(pollErrorVisible(0, 500), false);
  assert.equal(pollErrorVisible(1, 500), false);
  assert.equal(pollErrorVisible(PVP_TRANSIENT_FAILS_BEFORE_ERROR - 1, 503), false);
  assert.equal(pollErrorVisible(PVP_TRANSIENT_FAILS_BEFORE_ERROR, 500), true);
});

test('erro definitivo aparece na primeira falha', () => {
  assert.equal(pollErrorVisible(1, 403), true);
  assert.equal(pollErrorVisible(1, 404), true);
});

import { isTransientDbError, withTransientRetry } from './transientDb.js';

test('falha transitória do banco é reconhecida (código PG, mensagem, causa)', () => {
  assert.equal(isTransientDbError({ code: '40P01', message: 'deadlock detected' }), true);
  assert.equal(isTransientDbError(new Error("Couldn't connect to compute node")), true);
  assert.equal(isTransientDbError({ message: 'x', cause: { code: '55P03' } }), true);
  assert.equal(isTransientDbError(new Error('column "foo" does not exist')), false);
  assert.equal(isTransientDbError({ code: '23505' }), false);
  assert.equal(isTransientDbError(null), false);
});

test('withTransientRetry repete 1× só em falha transitória', async () => {
  let n = 0;
  const ok = await withTransientRetry(async () => { n++; if (n === 1) throw Object.assign(new Error('deadlock detected'), { code: '40P01' }); return 'ok'; }, 2, 1);
  assert.equal(ok, 'ok'); assert.equal(n, 2);
  let m = 0;
  await assert.rejects(withTransientRetry(async () => { m++; throw new Error('syntax error'); }, 2, 1));
  assert.equal(m, 1);
});
