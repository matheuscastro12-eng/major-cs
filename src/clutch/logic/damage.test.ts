import assert from 'node:assert/strict';
import test from 'node:test';
import { applyDamage, computeDamage, falloff } from './damage';

test('headshot de fuzil sem colete mata (34×4)', () => {
  const d = computeDamage('rifle', 'head', 0, 0);
  assert.equal(d.hp, 136);
  assert.equal(d.armor, 0);
});

test('colete reduz cabeça/torso e o colete cai dmg×0.5', () => {
  const d = computeDamage('rifle', 'torso', 0, 100);
  assert.equal(d.hp, Math.round(34 * 0.7));
  assert.equal(d.armor, Math.round(34 * 0.7 * 0.5));
  const p = computeDamage('pistol', 'head', 0, 100);
  assert.equal(p.hp, Math.round(30 * 4 * 0.6));
});

test('pernas ignoram o colete', () => {
  const a = computeDamage('rifle', 'legs', 0, 100);
  const b = computeDamage('rifle', 'legs', 0, 0);
  assert.deepEqual(a, b);
  assert.equal(a.armor, 0);
});

test('falloff 0.98 a cada 10 m e monotônico', () => {
  assert.equal(falloff('rifle', 0), 1);
  assert.ok(Math.abs(falloff('rifle', 10) - 0.98) < 1e-9);
  assert.ok(computeDamage('rifle', 'torso', 40, 0).hp <= computeDamage('rifle', 'torso', 5, 0).hp);
});

test('applyDamage muta hp/colete e não passa de zero', () => {
  const t = { hp: 20, armor: 50 };
  const dealt = applyDamage(t, 'rifle', 'head', 5);
  assert.equal(t.hp, 0);
  assert.equal(dealt, 20);
  assert.ok(t.armor < 50);
});
