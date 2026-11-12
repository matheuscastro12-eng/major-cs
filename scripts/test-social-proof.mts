import { test } from 'node:test';
import assert from 'node:assert/strict';
import { socialProofLines } from '../src/state/socialProof.ts';

test('prova social: sem dado, inválido ou zero → esconde', () => {
  assert.deepEqual(socialProofLines(null), { managers: null, soldOut: null });
  assert.equal(socialProofLines({ founders: 10, limit: 100, managers: 0 }).managers, null);
  assert.equal(socialProofLines({ founders: 10, limit: 100 }).managers, null);
  assert.equal(socialProofLines({ founders: 10, limit: 100, managers: Number.NaN }).managers, null);
});

test('prova social: formata o número real (pt-BR) e o singular', () => {
  assert.equal(socialProofLines({ founders: 10, limit: 100, managers: 1234 }).managers, '1.234 managers já liberaram a vitalícia');
  assert.equal(socialProofLines({ founders: 1, limit: 100, managers: 1 }).managers, '1 manager já liberou a vitalícia');
});

test('prova social: esgotou só quando founders >= limit', () => {
  assert.equal(socialProofLines({ founders: 99, limit: 100, managers: 5 }).soldOut, null);
  assert.equal(socialProofLines({ founders: 100, limit: 100, managers: 5 }).soldOut, 'As 100 vagas de Fundador esgotaram');
  assert.equal(socialProofLines({ founders: 120, limit: 100 }).soldOut, 'As 100 vagas de Fundador esgotaram');
});
