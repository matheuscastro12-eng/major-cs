// Contrato do realismo FM (engine/attrs/model.ts): o que as três frentes assumem.
import test from 'node:test';
import assert from 'node:assert/strict';
import { attrsOf, deriveAttrs, legacyFromAttrs, HIDDEN_KEYS, ALL_ATTRS, type PlayerAttrs } from '../src/engine/attrs/model.ts';

const p = { id: 'contract__kscerato', role: 'Rifler' as const, aim: 93, clutch: 90, consistency: 91, awp: 58, igl: 56 };

test('attrsOf é determinístico e respeita as escalas FM', () => {
  const x = attrsOf(p);
  assert.deepEqual(x, attrsOf({ ...p }));
  for (const k of ALL_ATTRS) assert.ok(x.a[k] >= 1 && x.a[k] <= 20, k);
  for (const k of HIDDEN_KEYS) assert.ok(x.h[k] >= 1 && x.h[k] <= 20, k);
  assert.ok(x.ca >= 1 && x.ca <= x.pa && x.pa <= 200);
});

test('attrs próprios vencem a derivação', () => {
  const own: PlayerAttrs = { ...deriveAttrs(p), ca: 150, pa: 180 };
  assert.equal(attrsOf({ ...p, attrs: own }).ca, 150);
});

test('legacyFromAttrs devolve os 5 números em 1–99 e preserva a ordem de grandeza', () => {
  const l = legacyFromAttrs(attrsOf(p));
  for (const v of Object.values(l)) assert.ok(v >= 1 && v <= 99);
  assert.ok(l.aim > l.igl, 'rifler de mira alta continua com mais mira que IGL');
});
