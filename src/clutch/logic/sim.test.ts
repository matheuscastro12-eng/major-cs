import assert from 'node:assert/strict';
import test from 'node:test';
import { createSim, step, NO_INPUT, type SimInput, traceShot, yawTo, EYE_H } from './sim';
import { demoConfig } from './testkit';
import { lineClear, moveWithCollision, solidAt } from './level';

function scripted(tick: number, yaw0: number): SimInput {
  // anda para frente, gira devagar e atira em rajadas
  return {
    ...NO_INPUT,
    fwd: tick % 240 < 150, left: tick % 300 > 200,
    fire: tick % 40 < 8,
    yaw: yaw0 + Math.sin(tick / 90) * 0.6, pitch: -0.02,
  };
}

function run(seed: number) {
  const s = createSim(demoConfig(seed));
  const yaw0 = s.player.yaw;
  for (let i = 0; i < 60 * 45 && !s.result; i++) step(s, scripted(i, yaw0));
  return { result: s.result, tick: s.tick, hp: s.player.hp, bots: s.bots.map((b) => [b.x, b.z, b.hp, b.state]) };
}

test('determinismo: mesma seed + mesmos inputs ⇒ mesmo resultado', () => {
  const a = run(42), b = run(42);
  assert.deepEqual(a, b);
  assert.ok(a.result, 'o round precisa terminar em 45 s');
});

test('sem input a bomba explode ou o jogador morre', () => {
  const s = createSim(demoConfig(7));
  for (let i = 0; i < 60 * 45 && !s.result; i++) step(s, { ...NO_INPUT, yaw: s.player.yaw });
  assert.ok(s.result);
  assert.ok(['exploded', 'died'].includes(s.result!.reason));
  assert.equal(s.result!.won, false);
});

test('hitscan: cabeça dá headshot e mira baixa dá perna', () => {
  const s = createSim(demoConfig(3, 1));
  const b = s.bots[0];
  let placed = false;
  for (let k = 0; k < 16 && !placed; k++) {
    const a = (k / 16) * Math.PI * 2;
    const x = b.x + Math.cos(a) * 3, z = b.z + Math.sin(a) * 3;
    if (!solidAt(s.ctx.level, x, z) && lineClear(s.ctx.level, x, z, b.x, b.z)) { s.player.x = x; s.player.z = z; placed = true; }
  }
  assert.ok(placed, 'precisa de um ponto livre a 3 m do bot');
  const yaw = yawTo(s.player.x, s.player.z, b.x, b.z);
  const head = traceShot(s, s.player.x, EYE_H, s.player.z, yaw, Math.atan2(1.62 - EYE_H, 3));
  assert.equal(head.bot, b);
  assert.equal(head.group, 'head');
  const legs = traceShot(s, s.player.x, EYE_H, s.player.z, yaw, Math.atan2(0.4 - EYE_H, 3));
  assert.equal(legs.bot, b);
  assert.equal(legs.group, 'legs');
});

test('invariante: nenhum bot nasce vendo o spawn nem preso', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const s = createSim(demoConfig(seed, 5));
    for (const b of s.bots) {
      assert.ok(!lineClear(s.ctx.level, b.x, b.z, s.player.x, s.player.z), `seed ${seed} ${b.id} vê o spawn`);
      assert.ok(!solidAt(s.ctx.level, b.x, b.z), `seed ${seed} ${b.id} dentro de sólido`);
      const free = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => {
        const q = { x: b.x, z: b.z };
        moveWithCollision(s.ctx.level, q, dx * 0.1, dz * 0.1);
        return Math.hypot(q.x - b.x, q.z - b.z) > 1e-4;
      });
      assert.ok(free, `seed ${seed} ${b.id} nasceu preso`);
    }
  }
});

test('ALERT persiste depois de ouvir um som', () => {
  const s = createSim(demoConfig(7, 1));
  const b = s.bots[0];
  b.heard = { pos: { x: b.x + 6, z: b.z }, kind: 'step' };
  step(s, NO_INPUT);
  assert.equal(b.state, 'ALERT');
  for (let i = 0; i < 30; i++) step(s, NO_INPUT);
  assert.equal(b.state, 'ALERT', 'deveria continuar em ALERT por alguns segundos');
});
