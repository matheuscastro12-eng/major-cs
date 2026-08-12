// PASSAGENS (#40) + BOOTCAMP (#35) + migração v26. Roda via `npm run test:sim`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openStint, closeStint, stintsOf } from '../src/engine/career/stints.ts';
import { applyBootcamp, canBootcamp, BOOTCAMP_COST, BOOTCAMP_MORALE, BOOTCAMP_FATIGUE } from '../src/engine/career/bootcamp.ts';
import { migrateSave, SAVE_VERSION } from '../src/state/saveMigrations.ts';

test('stints: abre/fecha imutável, idempotente, ciclo completo', () => {
  let st = openStint(undefined, 'p1', 'MAJOR//CS', 3, 82);
  assert.deepEqual(stintsOf(st, 'p1'), [{ team: 'MAJOR//CS', from: 3, to: null, startOvr: 82 }]);
  // reabrir com passagem ativa = no-op
  assert.equal(openStint(st, 'p1', 'Outra', 4, 90), st);
  // fecha com endOvr; fechar de novo = no-op
  st = closeStint(st, 'p1', 6, 87);
  assert.deepEqual(stintsOf(st, 'p1'), [{ team: 'MAJOR//CS', from: 3, to: 6, startOvr: 82, endOvr: 87 }]);
  assert.equal(closeStint(st, 'p1', 7), st);
  // segunda passagem (voltou ao clube)
  st = openStint(st, 'p1', 'MAJOR//CS', 9, 85);
  assert.equal(stintsOf(st, 'p1').length, 2);
  // to nunca antes do from (clamp)
  let w = openStint(undefined, 'p2', 'X', 5, 80);
  w = closeStint(w, 'p2', 2);
  assert.equal(stintsOf(w, 'p2')[0].to, 5);
  // fechar quem nunca abriu = no-op
  assert.deepEqual(stintsOf(closeStint(undefined, 'zz', 3), 'zz'), []);
});

test('bootcamp: aplica +moral/-fadiga com caps, 1x por split, exige caixa', () => {
  const r = applyBootcamp(['a', 'b'], { a: 98 }, { a: 10, b: 90 }, 70);
  assert.equal(r.morale.a, 100);                       // cap 100
  assert.equal(r.morale.b, 70 + BOOTCAMP_MORALE);     // default + boost
  assert.equal(r.fatigue.a, 0);                        // piso 0
  assert.equal(r.fatigue.b, 90 - BOOTCAMP_FATIGUE);
  assert.equal(canBootcamp(BOOTCAMP_COST, 4, undefined), true);
  assert.equal(canBootcamp(BOOTCAMP_COST, 4, 4), false);   // já usado no split
  assert.equal(canBootcamp(BOOTCAMP_COST, 5, 4), true);    // split novo libera
  assert.equal(canBootcamp(BOOTCAMP_COST - 1, 4, undefined), false);
});

test('migração v26: seed de passagem ativa pro elenco atual, idempotente', () => {
  const raw = {
    _v: 25,
    org: { name: 'Brasa GG' },
    squad: [{ playerId: 'a' }, { playerId: 'b' }],
    stints: { a: [{ team: 'Brasa GG', from: 2, to: null, startOvr: 80 }] }, // já tinha (não sobrescreve)
  } as never;
  const out = migrateSave(raw) as { _v: number; stints: Record<string, unknown[]> };
  assert.equal(out._v, SAVE_VERSION);
  assert.deepEqual(out.stints.a, [{ team: 'Brasa GG', from: 2, to: null, startOvr: 80 }]);
  assert.deepEqual(out.stints.b, [{ team: 'Brasa GG', from: 1, to: null, startOvr: 0 }]);
  // idempotente
  assert.deepEqual(migrateSave(out as never), out);
});
