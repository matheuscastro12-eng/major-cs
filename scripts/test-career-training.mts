// FOCO DE TREINO (#22 — engine/career/training.ts). Roda via `npm run test:sim`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestFocus, applyFocusBias, focusBiasTotal, FOCUS_BIAS_CAP, CORE_STATS } from '../src/engine/career/training.ts';
import type { Player } from '../src/types.ts';

const mk = (over: Partial<Player>): Player => ({
  id: 'x', nick: 'x', country: 'br', role: 'Rifler', aim: 80, clutch: 80, consistency: 80, awp: 80, igl: 80, ...over,
} as Player);

test('suggestFocus: recomenda a lacuna RELEVANTE pra função', () => {
  // AWPer com AWP baixo → awp; Entry com mira baixa → aim; IGL com leitura baixa → igl
  assert.equal(suggestFocus(mk({ role: 'AWP', awp: 62 })), 'awp');
  assert.equal(suggestFocus(mk({ role: 'Entry', aim: 62 })), 'aim');
  assert.equal(suggestFocus(mk({ role: 'IGL', igl: 62 })), 'igl');
  // lacuna irrelevante pra role perde da relevante: Entry com awp péssimo mas
  // mira mediana ainda treina MIRA (awp de entry não ganha jogo)
  assert.equal(suggestFocus(mk({ role: 'Entry', awp: 50, aim: 74 })), 'aim');
  // o viés acumulado fecha a lacuna: sugerido muda depois de especializar
  const igl = mk({ role: 'IGL', igl: 88, consistency: 70 });
  assert.equal(suggestFocus(igl), 'consistency');
});

test('applyFocusBias: +1 por split, cap por atributo e total', () => {
  let bias = applyFocusBias(undefined, 'aim');
  assert.deepEqual(bias, { aim: 1 });
  for (let i = 0; i < 10; i++) bias = applyFocusBias(bias, 'aim');
  assert.equal(bias.aim, FOCUS_BIAS_CAP, 'cap por atributo');
  // trocar o foco continua acumulando até o cap TOTAL
  for (let i = 0; i < 10; i++) bias = applyFocusBias(bias, 'clutch');
  assert.ok(focusBiasTotal(bias) <= FOCUS_BIAS_CAP + 2, `total ${focusBiasTotal(bias)}`);
  // imutável
  const before = { aim: 1 };
  const after = applyFocusBias(before, 'aim');
  assert.deepEqual(before, { aim: 1 });
  assert.equal(after.aim, 2);
  assert.equal(CORE_STATS.length, 5);
});
