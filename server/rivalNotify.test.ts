import assert from 'node:assert/strict';
import test from 'node:test';
import { detectOvertakes } from './rivalNotify.js';

// ladder DEPOIS do report: eu (me@x) subi de 1010 pra 1060 e passei por cima de b, c e d.
const ladder = [
  { email: 'a@x', nick: 'Ana', mmr: 1100 },
  { email: 'me@x', nick: 'Eu', mmr: 1060 },
  { email: 'b@x', nick: 'Bia', mmr: 1050 },
  { email: 'c@x', nick: 'Caio', mmr: 1030 },
  { email: 'd@x', nick: 'Dudu', mmr: 1020 },
  { email: 'e@x', nick: 'Edu', mmr: 1000 }, // já estava abaixo de mim: não foi ultrapassado
];

test('rival declarado ultrapassado é notificado (posição antiga → nova)', () => {
  const out = detectOvertakes({ email: 'ME@x', before: 1010, after: 1060 }, ladder, ['C@x']);
  assert.deepEqual(out.map((o) => [o.email, o.reason, o.oldPos, o.newPos]), [['b@x', 'neighbor', 2, 3], ['c@x', 'rival', 3, 4]]);
});

test('vizinho imediato (logo abaixo) é notificado mesmo sem rivalidade; os demais não', () => {
  const out = detectOvertakes({ email: 'me@x', before: 1010, after: 1060 }, ladder, []);
  assert.deepEqual(out, [{ email: 'b@x', nick: 'Bia', oldPos: 2, newPos: 3, reason: 'neighbor' }]);
});

test('quem já estava abaixo não conta, mesmo sendo rival', () => {
  const out = detectOvertakes({ email: 'me@x', before: 1010, after: 1060 }, ladder, ['e@x']);
  assert.ok(!out.some((o) => o.email === 'e@x'));
});

test('sem mudança de ordem (perdeu ou RP igual) não notifica', () => {
  assert.deepEqual(detectOvertakes({ email: 'me@x', before: 1060, after: 1040 }, ladder, ['b@x']), []);
  assert.deepEqual(detectOvertakes({ email: 'me@x', before: 1060, after: 1060 }, ladder, ['b@x']), []);
});

test('fora do top N é ignorado', () => {
  const big = Array.from({ length: 120 }, (_, i) => ({ email: `p${i}@x`, nick: `P${i}`, mmr: 2000 - i * 5 }));
  // eu em 105º (índice 104): subi, mas estou fora do top 100 → nada
  big[104] = { email: 'me@x', nick: 'Eu', mmr: 2000 - 104 * 5 };
  assert.deepEqual(detectOvertakes({ email: 'me@x', before: 1000, after: big[104].mmr }, big, ['p110@x']), []);
  // vítima fora do top 100 (índice 101) não entra, mesmo rival
  const big2 = Array.from({ length: 120 }, (_, i) => ({ email: `p${i}@x`, nick: `P${i}`, mmr: 2000 - i * 5 }));
  big2[98] = { email: 'me@x', nick: 'Eu', mmr: 2000 - 98 * 5 };
  const out = detectOvertakes({ email: 'me@x', before: 0, after: big2[98].mmr }, big2, ['p101@x', 'p99@x']);
  assert.deepEqual(out.map((o) => o.email), ['p99@x']);
});
