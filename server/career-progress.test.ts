import assert from 'node:assert/strict';
import test from 'node:test';
import { careerEventKey } from '../src/engine/career/progress.js';
import { ageWeight, VRS_WINDOW } from '../src/engine/mundo/vrs.js';

// [fase 4 · circuito] o VRS rolante (decaimento 0,6 por evento) virou o VRS
// unificado: o resultado pesa inteiro por 1 etapa e cai até zerar na janela.
test('career VRS: results age out (full weight, then linear decay to zero)', () => {
  assert.equal(ageWeight(0), 1);
  assert.equal(ageWeight(1), 1);
  assert.ok(ageWeight(2) < 1 && ageWeight(2) > ageWeight(4));
  assert.equal(ageWeight(VRS_WINDOW), 0);
});

test('career event keys distinguish all events in the same split', () => {
  assert.equal(careerEventKey(4, 1), '4:1');
  assert.equal(careerEventKey(4, 2), '4:2');
  assert.notEqual(careerEventKey(4, 1), careerEventKey(4, 3));
});
