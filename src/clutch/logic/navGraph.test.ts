import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLevel, toMap, toWorld, solidAt, BOMB_MAP, PLAYER_SPAWN_MAP } from './level';
import { aStar, buildNavGraph, nodeByName, NAMED } from './navGraph';

const level = buildLevel();
const g = buildNavGraph(level);

test('nós nomeados do B existem e estão em chão livre', () => {
  for (const n of NAMED) {
    const node = nodeByName(g, n);
    assert.equal(solidAt(level, node.x, node.z), false, n);
  }
  for (const p of [BOMB_MAP, PLAYER_SPAWN_MAP]) {
    const w = toWorld(p.x, p.y);
    assert.equal(solidAt(level, w.x, w.z), false);
  }
});

test('A* acha caminho ramp ↔ bCT nos dois sentidos', () => {
  const a = nodeByName(g, 'ramp').id, b = nodeByName(g, 'bCT').id;
  const p1 = aStar(g, a, b), p2 = aStar(g, b, a);
  assert.ok(p1.length >= 2);
  assert.equal(p1[0], a); assert.equal(p1[p1.length - 1], b);
  assert.equal(p2[0], b); assert.equal(p2[p2.length - 1], a);
  assert.ok(p2.length >= 2);
});

test('conversão 100×100 ↔ metros é consistente', () => {
  for (const [x, y] of [[30, 62], [76, 80], [50.5, 70.25]]) {
    const w = toWorld(x, y);
    const m = toMap(w.x, w.z);
    assert.ok(Math.abs(m.x - x) < 1e-9 && Math.abs(m.y - y) < 1e-9);
  }
  const a = toWorld(30, 62), b = toWorld(40, 62);
  assert.ok(Math.abs((b.x - a.x) - 6) < 1e-9); // 10 unidades = 6 m
});
