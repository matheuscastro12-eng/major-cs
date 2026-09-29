// [integração · fase 3] Quem entra no elenco (contratação, promoção da base,
// stand-in) ganha a condição padrão na entrada; as telas usam o padrão como
// fallback. `npm run test:sim`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withEntryCondition, defaultCondition } from '../src/engine/gestao/treino.ts';

test('entrada no elenco: o recém-chegado ganha a condição padrão; quem já tinha não muda', () => {
  const tired = { fitness: 55, sharpness: 40, injury: null };
  const cond = { a: tired };
  const next = withEntryCondition(cond, ['a', 'novo'])!;
  assert.deepEqual(next.novo, defaultCondition(), 'contratado/promovido/stand-in: 100 de físico, ritmo 70');
  assert.deepEqual(next.novo, { fitness: 100, sharpness: 70, injury: null });
  assert.equal(next.a, tired, 'quem já estava no elenco segue com a sua condição');
  assert.equal(withEntryCondition(next, ['a', 'novo']), null, 'idempotente');
  assert.deepEqual(withEntryCondition(undefined, ['x'])!.x, defaultCondition(), 'save sem bloco de condição');
});
