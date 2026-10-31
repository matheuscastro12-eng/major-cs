import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyPicks, type MajorPicks } from '../src/engine/majorSingapore.ts';
import { toApiPick, fromApiPick } from '../src/engine/pickemConvert.ts';
import { validatePick, scoreStage } from '../src/engine/majorPickem.ts';

const T = Array.from({ length: 16 }, (_, i) => `t${i}`);
const full = (): MajorPicks => ({
  ...emptyPicks(), s1: T.slice(0, 8), x30: [['t0', 't1'], [], []], x03: [['t14', 't15'], [], []],
  bracket: ['t0', 't1', 't2', 't3', 't0', 't2', 't2'],
});

test('Stage suíço: 8 classificados + 3-0/0-3 → threeZero/zeroThree/advance válidos na API', () => {
  const r = toApiPick(full(), 's1');
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.pick, { threeZero: ['t0', 't1'], zeroThree: ['t14', 't15'], advance: ['t2', 't3', 't4', 't5', 't6', 't7'] });
  assert.ok(validatePick('s1', r.pick, T).ok);
});

test('playoffs: chave → semis/final/campeão válidos na API', () => {
  const r = toApiPick(full(), 'playoffs');
  assert.ok(r.ok && validatePick('playoffs', r.pick, T.slice(0, 8)).ok);
});

test('incompleto ou inconsistente dá erro claro', () => {
  assert.equal(toApiPick(emptyPicks(), 's1').ok, false);
  assert.equal(toApiPick({ ...full(), x30: [['t0'], [], []] }, 's1').ok, false);
  assert.equal(toApiPick({ ...full(), x03: [['t0', 't15'], [], []] }, 's1').ok, false);
  assert.equal(toApiPick(emptyPicks(), 'playoffs').ok, false);
});

test('ida e volta preserva o palpite e a pontuação bate', () => {
  const p = full();
  const r = toApiPick(p, 's1');
  assert.ok(r.ok);
  if (!r.ok) return;
  const back = fromApiPick(emptyPicks(), 's1', r.pick);
  assert.deepEqual([...back.s1].sort(), [...p.s1].sort());
  assert.deepEqual(back.x30[0], p.x30[0]);
  const sc = scoreStage('s1', r.pick, { threeZero: ['t0', 't1'], zeroThree: ['t14', 't15'], advanced: T.slice(2, 8) });
  assert.ok(sc.points > 0);
});
