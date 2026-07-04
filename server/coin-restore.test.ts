import assert from 'node:assert/strict';
import test from 'node:test';
import { restorableCoins } from './coin-restore.js';

test('restorável = comprado − já restaurado', () => {
  assert.equal(restorableCoins([30000, 50000], []), 80000);
  assert.equal(restorableCoins([30000, 50000], [30000]), 50000);
  assert.equal(restorableCoins([120000], [50000, 20000]), 50000);
});

test('sem compras não há nada a restaurar', () => {
  assert.equal(restorableCoins([], []), 0);
  assert.equal(restorableCoins([], [30000]), 0);
});

test('nunca negativo, mesmo com restaurado acima do comprado', () => {
  assert.equal(restorableCoins([30000], [30000, 30000]), 0);
  assert.equal(restorableCoins([10000], [50000]), 0);
});

test('re-emissão consome o saldo: restaurar tudo zera as próximas', () => {
  const purchased = [30000, 50000];
  const restored: number[] = [];
  const first = restorableCoins(purchased, restored);
  assert.equal(first, 80000);
  restored.push(first); // servidor grava a re-emissão em rtm_coin_restores
  assert.equal(restorableCoins(purchased, restored), 0);
  // compra nova depois do restore volta a liberar só o delta
  purchased.push(120000);
  assert.equal(restorableCoins(purchased, restored), 120000);
});

test('valores inválidos não corrompem a soma', () => {
  assert.equal(restorableCoins([30000, Number.NaN, -500], [Number.POSITIVE_INFINITY]), 30000);
});
