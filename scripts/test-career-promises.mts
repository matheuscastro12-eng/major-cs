// PROMESSAS FORMAIS (#10 — engine/career/promises.ts). Roda via `npm run test:sim`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promiseOffersFor, evaluatePromise, PROMISE_SIGN_DELTA } from '../src/engine/career/promises.ts';

test('promessas: 2 ofertas por split, determinísticas, com aporte coerente por tier', () => {
  for (let split = 1; split <= 12; split++) {
    for (const tier of [1, 2, 3]) {
      const a = promiseOffersFor(tier, split, split % 4 === 0);
      const b = promiseOffersFor(tier, split, split % 4 === 0);
      assert.deepEqual(a, b, `split ${split}/t${tier}: não determinístico`);
      assert.equal(a.length, 2);
      // agressiva paga mais e cobra mais caro que a conservadora
      assert.ok(a[0].injection >= a[1].injection, `split ${split}/t${tier}`);
      assert.ok(a[0].breakDelta <= a[1].breakDelta);
      for (const p of a) {
        assert.equal(p.split, split);
        assert.ok(p.keepDelta > 0 && p.breakDelta < 0);
        assert.ok(p.injection >= 0);
      }
    }
    // tier 1 move mais dinheiro que tier 3 na mesma oferta agressiva
    const t1 = promiseOffersFor(1, split, false)[0];
    const t3 = promiseOffersFor(3, split, false)[0];
    assert.ok(t1.injection > t3.injection);
  }
  assert.ok(PROMISE_SIGN_DELTA > 0);
});

test('promessas: julgamento cobre a matriz de resultados', () => {
  const base = { isChampion: false, qualifiedMajor: false, finalPos: 6, tierChange: null as 'up' | 'down' | null };
  const p = (type: 'title' | 'major' | 'top4' | 'noRelegation') =>
    ({ type, text: '', split: 1, injection: 0, keepDelta: 10, breakDelta: -20 });
  // título: só o troféu paga
  assert.equal(evaluatePromise(p('title'), { ...base, isChampion: true }), true);
  assert.equal(evaluatePromise(p('title'), { ...base, finalPos: 2 }), false);
  // major: classificação decide
  assert.equal(evaluatePromise(p('major'), { ...base, qualifiedMajor: true }), true);
  assert.equal(evaluatePromise(p('major'), base), false);
  // top4: posição final (playoff incluso)
  assert.equal(evaluatePromise(p('top4'), { ...base, finalPos: 4 }), true);
  assert.equal(evaluatePromise(p('top4'), { ...base, finalPos: 5 }), false);
  // não cair: qualquer coisa menos rebaixamento
  assert.equal(evaluatePromise(p('noRelegation'), base), true);
  assert.equal(evaluatePromise(p('noRelegation'), { ...base, tierChange: 'up' }), true);
  assert.equal(evaluatePromise(p('noRelegation'), { ...base, tierChange: 'down' }), false);
});
