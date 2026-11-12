import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emailSignupDecision, isSetupHash, makeSetupHash, setupKeyMatches, setupKeyValid, SETUP_LOCK_SEC } from './setup-password.ts';

// hash de mentira só pra testar o encadeamento (o real é scrypt em api/account.ts)
const hashPw = (s: string) => `salt:${s}`;
const verifyPw = (pw: string, stored: string) => stored === `salt:${pw}`;
const KEY = 'a'.repeat(64);

test('chave de configuração: formato, hash e verificação', () => {
  assert.equal(setupKeyValid(KEY), true);
  assert.equal(setupKeyValid('curta'), false);
  assert.equal(setupKeyValid('Z'.repeat(64)), false);
  const h = makeSetupHash(KEY, hashPw);
  assert.equal(isSetupHash(h), true);
  assert.equal(isSetupHash('salt:hash'), false);
  assert.equal(setupKeyMatches(h, KEY, verifyPw), true);
  assert.equal(setupKeyMatches(h, 'b'.repeat(64), verifyPw), false);
  // senha normal nunca vale como chave
  assert.equal(setupKeyMatches(`salt:${KEY}`, KEY, verifyPw), false);
});

test('cadastro só com e-mail: conta existente ou e-mail pago → login', () => {
  assert.equal(emailSignupDecision({ hasAccount: true, paidEmail: false, pending: null }), 'login');
  assert.equal(emailSignupDecision({ hasAccount: false, paidEmail: true, pending: null }), 'login');
  assert.equal(emailSignupDecision({ hasAccount: false, paidEmail: false, pending: null }), 'ok');
});

test('cadastro só com e-mail: pendente de outro navegador fica travado por um tempo', () => {
  assert.equal(emailSignupDecision({ hasAccount: false, paidEmail: false, pending: { setup: true, sameKey: false, ageSec: 60 } }), 'busy');
  assert.equal(emailSignupDecision({ hasAccount: false, paidEmail: false, pending: { setup: true, sameKey: true, ageSec: 60 } }), 'ok');
  assert.equal(emailSignupDecision({ hasAccount: false, paidEmail: false, pending: { setup: true, sameKey: false, ageSec: SETUP_LOCK_SEC + 1 } }), 'ok');
  // pendente com senha (cadastro antigo) não trava: o fluxo antigo também sobrescrevia
  assert.equal(emailSignupDecision({ hasAccount: false, paidEmail: false, pending: { setup: false, sameKey: false, ageSec: 60 } }), 'ok');
});
