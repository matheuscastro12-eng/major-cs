import assert from 'node:assert/strict';
import test from 'node:test';
import { decide, MAX_PEEKERS, type BotSelf, type Perception, type World } from './botBrain';
import { botProfileFrom } from './botProfile';
import { flatAttrs } from './testkit';

const bot = (over: Partial<BotSelf> = {}): BotSelf => ({
  state: 'HOLD', hp: 100, pos: { x: 0, z: 0 }, hold: { x: 0, z: 0 }, holdAim: { x: 0, z: -5 }, cover: { x: 3, z: 3 },
  lastKnown: null, stateTime: 0, profile: botProfileFrom(flatAttrs(10)), ...over,
});
const perc = (over: Partial<Perception> = {}): Perception => ({ sees: false, playerPos: null, heard: null, tradeCue: null, roll: 0.99, ...over });
const world = (over: Partial<World> = {}): World => ({ defusing: false, bomb: { x: 1, z: 1 }, peekers: 0, isTradeWaiter: false, teammatesAlive: 2, ...over });

test('HOLD sem estímulo continua HOLD', () => {
  assert.equal(decide(bot(), perc(), world()).state, 'HOLD');
});

test('HOLD → ALERT ao ouvir som (pre-aim no som)', () => {
  const i = decide(bot(), perc({ heard: { pos: { x: 5, z: 5 }, kind: 'step' } }), world());
  assert.equal(i.state, 'ALERT');
  assert.deepEqual(i.aimAt, { x: 5, z: 5 });
});

test('ALERT → ENGAGE quando o alvo fica visível', () => {
  const i = decide(bot({ state: 'ALERT' }), perc({ sees: true, playerPos: { x: 2, z: 2 } }), world());
  assert.equal(i.state, 'ENGAGE');
  assert.equal(i.fire, true);
});

test('HP baixo vendo o alvo → REPOSITION', () => {
  const b = bot({ state: 'ENGAGE', hp: 10 });
  const i = decide(b, perc({ sees: true, playerPos: { x: 2, z: 2 }, roll: 0.99 }), world());
  assert.equal(i.state, 'REPOSITION');
  assert.deepEqual(i.moveTo, b.cover);
});

test('defuse começou → RETAKE_RUSH na bomba', () => {
  const i = decide(bot(), perc(), world({ defusing: true }));
  assert.equal(i.state, 'RETAKE_RUSH');
  assert.deepEqual(i.moveTo, { x: 1, z: 1 });
});

test('limite de 2 peekers: trade e push travam', () => {
  const cue = { x: 4, z: 4 };
  assert.equal(decide(bot(), perc({ tradeCue: cue }), world()).state, 'TRADE');
  const blocked = decide(bot(), perc({ tradeCue: cue }), world({ peekers: MAX_PEEKERS }));
  assert.notEqual(blocked.state, 'TRADE');
  const pushy = bot({ profile: { ...botProfileFrom(flatAttrs(20)), aggression: 1 } });
  const heard = perc({ heard: { pos: cue, kind: 'shot' }, roll: 0 });
  assert.ok(decide(pushy, heard, world()).moveTo);
  assert.equal(decide(pushy, heard, world({ peekers: MAX_PEEKERS })).moveTo, null);
});
