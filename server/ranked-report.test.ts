import assert from 'node:assert/strict';
import test from 'node:test';
import { decidePair, rankedDelta, soloGraceExpired, GRACE_MS } from '../api/_reportPairing.js';

const K = { placementGames: 5, kWin: 25, kLoss: 20, kPlace: 40 };

test('report solo espera o oponente', () => {
  assert.equal(decidePair(true, null, null), 'wait');
  assert.equal(decidePair(false, null, null), 'wait');
});

test('reports consistentes aplicam os dois lados', () => {
  assert.equal(decidePair(true, false, 'pending'), 'apply-both');
  assert.equal(decidePair(false, true, 'pending'), 'apply-both');
});

test('os dois reclamando vitória (ou derrota) = conflito, ninguém pontua', () => {
  assert.equal(decidePair(true, true, 'pending'), 'conflict');
  assert.equal(decidePair(false, false, 'pending'), 'conflict');
});

test('oponente já aplicado no solo: só o meu lado entra (sem dupla contagem)', () => {
  assert.equal(decidePair(true, false, 'applied-solo'), 'apply-mine');
});

test('conflito prévio contamina a partida', () => {
  assert.equal(decidePair(true, false, 'conflict'), 'conflict');
});

test('delta: vitória/derrota normais e K de colocação', () => {
  assert.equal(rankedDelta(true, 1000, 10, K), 25);
  assert.equal(rankedDelta(false, 1000, 10, K), -20);
  assert.equal(rankedDelta(true, 1000, 0, K), 40);
  assert.equal(rankedDelta(false, 1000, 4, K), -40);
});

test('derrota nunca leva MMR abaixo de zero', () => {
  assert.equal(rankedDelta(false, 12, 10, K), -12);
  assert.equal(rankedDelta(false, 0, 10, K), 0);
});

test('carência do report solo', () => {
  const t0 = 1_000_000;
  assert.equal(soloGraceExpired(t0, t0 + GRACE_MS - 1), false);
  assert.equal(soloGraceExpired(t0, t0 + GRACE_MS), true);
});
