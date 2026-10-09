import assert from 'node:assert/strict';
import test from 'node:test';
import { botProfileFrom } from './botProfile';
import { flatAttrs } from './testkit';

test('mapeamento monotônico: atributo maior → reação e erro menores', () => {
  let prev = botProfileFrom(flatAttrs(1));
  for (let v = 2; v <= 20; v++) {
    const cur = botProfileFrom(flatAttrs(v));
    assert.ok(cur.reactionMs < prev.reactionMs);
    assert.ok(cur.aimErrorDeg < prev.aimErrorDeg);
    assert.ok(cur.headshotChance > prev.headshotChance);
    prev = cur;
  }
});

test('faixas da spec', () => {
  const lo = botProfileFrom(flatAttrs(1));
  const hi = botProfileFrom(flatAttrs(20));
  assert.ok(Math.abs(lo.reactionMs - 420) < 1e-9 && Math.abs(hi.reactionMs - 160) < 1e-9);
  assert.ok(Math.abs(lo.aimErrorDeg - 6) < 1e-9 && Math.abs(hi.aimErrorDeg - 0.8) < 1e-9);
  assert.ok(Math.abs(lo.headshotChance - 0.15) < 1e-9 && Math.abs(hi.headshotChance - 0.55) < 1e-9);
  assert.ok(Math.abs(lo.sprayComp - 0.3) < 1e-9 && Math.abs(hi.sprayComp - 0.9) < 1e-9);
  assert.ok(lo.retreatHp === 30 && hi.retreatHp === 70);
  for (const p of [lo, hi]) {
    assert.ok(p.aggression >= 0 && p.aggression <= 1);
    assert.ok(p.teamwork >= 0 && p.teamwork <= 1);
  }
});

test('tap > spray vira rajada', () => {
  assert.equal(botProfileFrom(flatAttrs(10, { tap: 18, spray: 6 })).burst, true);
  assert.equal(botProfileFrom(flatAttrs(10, { tap: 6, spray: 18 })).burst, false);
});
