// O1-37 / ENGE-11 — O auto-sim do playoff da academia é puro: mesma seed, mesmo
// placar. Roda `tsx --test scripts/test-academy-playoff.mts`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoPlayoffResult, type AcademyPlayoffSeed } from '../src/engine/career/academyMatch.ts';
import { makeRng } from '../src/engine/rng.ts';

const seed = (id: string, strength: number): AcademyPlayoffSeed => ({
  id, name: id.toUpperCase(), tag: id.slice(0, 3).toUpperCase(),
  colors: ['#000', '#fff'], strength, isUser: false,
});

test('mesma seed produz o mesmo resultado', () => {
  const a = seed('alpha', 70); const b = seed('bravo', 68);
  for (let s = 1; s <= 50; s++) {
    assert.deepEqual(autoPlayoffResult(a, b, makeRng(s)), autoPlayoffResult(a, b, makeRng(s)));
  }
});

test('placar é sempre de MD3 e o vencedor bate com o placar', () => {
  const a = seed('alpha', 75); const b = seed('bravo', 60);
  for (let s = 1; s <= 200; s++) {
    const r = autoPlayoffResult(a, b, makeRng(s));
    const [sa, sb] = r.score;
    assert.ok(Math.max(sa, sb) === 2 && Math.min(sa, sb) <= 1, `placar inválido ${sa}-${sb}`);
    assert.equal(r.winnerId, sa > sb ? a.id : b.id);
  }
});

test('o time mais forte vence a maioria', () => {
  const a = seed('alpha', 80); const b = seed('bravo', 60);
  let wins = 0;
  for (let s = 1; s <= 200; s++) if (autoPlayoffResult(a, b, makeRng(s)).winnerId === 'alpha') wins++;
  assert.ok(wins > 180, `forte venceu só ${wins}/200`);
});
