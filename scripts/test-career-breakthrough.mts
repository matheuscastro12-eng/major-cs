// POTENCIAL DINÂMICO (#17 — engine/career/breakthrough.ts). Roda via `npm run test:sim`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tryBreakthrough, BREAKTHROUGH_CAP } from '../src/engine/career/breakthrough.ts';

const base = { playerId: 'p1', split: 3, age: 18, ovr: 74, pot: 80, currentBonus: 0 };

test('breakthrough: exige janela mínima e gatilho de performance', () => {
  // sem janela / janela curta: nada
  assert.equal(tryBreakthrough({ ...base, ratings: undefined }), 0);
  assert.equal(tryBreakthrough({ ...base, ratings: [1.9, 1.8, 1.7] }), 0);
  // janela ok mas jogando na média: nada, em QUALQUER split (sem sorte grátis)
  for (let split = 1; split <= 30; split++) {
    assert.equal(tryBreakthrough({ ...base, split, ratings: [1.0, 1.1, 0.9, 1.05, 1.1] }), 0);
  }
});

test('breakthrough: jovem em explosão fura; 26+ nunca fura', () => {
  const hot = [1.8, 1.5, 1.6, 1.4, 1.7];   // média 1.6 + pico ≥1.75 → gatilho de explosão
  // determinístico: mesmo input → mesmo resultado
  const a = tryBreakthrough({ ...base, ratings: hot });
  assert.equal(a, tryBreakthrough({ ...base, ratings: hot }));
  // em ALGUM split dos próximos 20, o prodígio de 18 anos fura (chance 0.6+ por split)
  let gained = 0;
  for (let split = 1; split <= 20 && !gained; split++) gained = tryBreakthrough({ ...base, split, ratings: hot });
  assert.equal(gained, 3, 'explosão dá +3');
  // 26+ nunca — mesmo com os mesmos números
  for (let split = 1; split <= 40; split++) {
    assert.equal(tryBreakthrough({ ...base, age: 26, split, ratings: hot }), 0);
  }
});

test('breakthrough: consistência dá +2 e o cap de carreira segura em +8', () => {
  const steady = [1.3, 1.35, 1.3, 1.28, 1.32];   // média ≥1.28, sem pico de explosão
  let gained = 0;
  for (let split = 1; split <= 30 && !gained; split++) gained = tryBreakthrough({ ...base, split, ratings: steady });
  assert.equal(gained, 2, 'consistência dá +2');
  // cap: quem já furou 8 não fura mais
  for (let split = 1; split <= 40; split++) {
    assert.equal(tryBreakthrough({ ...base, split, currentBonus: BREAKTHROUGH_CAP, ratings: [1.9, 1.9, 1.9, 1.9] }), 0);
  }
  // perto do cap, o ganho é truncado (nunca passa de 8 total)
  let cap = 0;
  for (let split = 1; split <= 40 && !cap; split++) cap = tryBreakthrough({ ...base, split, currentBonus: 7, ratings: [1.9, 1.9, 1.9, 1.9] });
  assert.ok(cap <= 1, `ganho truncado no cap (deu ${cap})`);
});
