import assert from 'node:assert/strict';
import test from 'node:test';
import { createBomb, stepBomb, beepInterval, DEFUSE_S } from './bomb';

const dt = 1 / 60;
const hold = { holding: true, inRange: true, moving: false };
const idle = { holding: false, inRange: true, moving: false };

test('defuse completa em 5 s segurando', () => {
  const b = createBomb(40);
  let done = false, t = 0;
  while (!done && t < 10) { t += dt; done = stepBomb(b, dt, hold).includes('defused'); }
  assert.ok(done);
  assert.ok(Math.abs(t - DEFUSE_S) < 2 * dt, `t=${t}`);
});

test('soltar E ou andar reinicia o defuse', () => {
  const b = createBomb(40);
  for (let i = 0; i < 120; i++) stepBomb(b, dt, hold);
  assert.ok(b.defuse > 1.9);
  assert.ok(stepBomb(b, dt, idle).includes('defuse_cancel'));
  assert.equal(b.defuse, 0);
  for (let i = 0; i < 60; i++) stepBomb(b, dt, hold);
  stepBomb(b, dt, { ...hold, moving: true });
  assert.equal(b.defuse, 0);
});

test('timer zerado explode', () => {
  const b = createBomb(1);
  let ex = false;
  for (let i = 0; i < 120 && !ex; i++) ex = stepBomb(b, dt, idle).includes('exploded');
  assert.ok(ex);
  assert.equal(b.exploded, true);
});

test('explosão vence o defuse se o tempo acaba antes', () => {
  const b = createBomb(3);
  const evs: string[] = [];
  for (let i = 0; i < 600; i++) evs.push(...stepBomb(b, dt, hold));
  assert.ok(evs.includes('exploded'));
  assert.ok(!evs.includes('defused'));
});

test('bip acelera com o tempo', () => {
  assert.ok(beepInterval(5) < beepInterval(35));
  assert.ok(beepInterval(0) >= 0.12);
});
