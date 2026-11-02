import { test } from 'node:test';
import assert from 'node:assert/strict';
import { offerVariantOf, foundersLeft, fnv1a } from '../src/state/offerAb.ts';

test('split estável por sid', () => {
  for (const sid of ['abc', 'x1y2z3', 'kq9d0m2lmh8']) assert.equal(offerVariantOf(sid), offerVariantOf(sid));
});
test('split ~50/50', () => {
  let b = 0; const n = 4000;
  for (let i = 0; i < n; i++) if (offerVariantOf(Math.random().toString(36).slice(2, 10) + i.toString(36)) === 'B') b++;
  assert.ok(Math.abs(b / n - 0.5) < 0.04, `B=${b / n}`);
});
test('override ?ab=', () => {
  assert.equal(offerVariantOf('abc', 'a'), 'A');
  assert.equal(offerVariantOf('abc', 'B'), 'B');
  assert.equal(offerVariantOf('abc', 'zz'), offerVariantOf('abc'));
});
test('fnv1a conhecido', () => { assert.equal(fnv1a(''), 0x811c9dc5); });
test('vagas de Fundador', () => {
  assert.equal(foundersLeft(null), null);
  assert.equal(foundersLeft({ founders: 500, limit: 500 }), null);
  assert.equal(foundersLeft({ founders: 480, limit: 500 }), 20);
});
