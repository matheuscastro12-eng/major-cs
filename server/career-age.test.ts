import assert from 'node:assert/strict';
import test from 'node:test';
import { tickAging } from '../src/engine/aging.js';
import {
  academyAgeAfterSplit,
  ageFromCareerStart,
  ageFromDebut,
  careerYearsAtSplit,
  legacyYouthBaseAgeAtPromotion,
  youthDebutAtPromotion,
} from '../src/engine/career/playerAge.js';

test('career years advance once every three splits', () => {
  assert.equal(careerYearsAtSplit(1), 0);
  assert.equal(careerYearsAtSplit(2), 0);
  assert.equal(careerYearsAtSplit(3), 0);
  assert.equal(careerYearsAtSplit(4), 1);
  assert.equal(careerYearsAtSplit(6), 1);
  assert.equal(careerYearsAtSplit(7), 2);
});

test('academy prospects age only when closing a full career year', () => {
  assert.equal(academyAgeAfterSplit(18, 1), 18);
  assert.equal(academyAgeAfterSplit(18, 2), 18);
  assert.equal(academyAgeAfterSplit(18, 3), 19);
  assert.equal(academyAgeAfterSplit(19, 6), 20);
});

test('promoted academy player keeps debut age instead of being rebased to split one', () => {
  const debut = youthDebutAtPromotion(18, 34);

  assert.equal(ageFromDebut(debut, 34), 18);
  assert.equal(ageFromDebut(debut, 36), 18);
  assert.equal(ageFromDebut(debut, 37), 19);

  // Legacy youthAge still stores the split-1 equivalent for old code paths,
  // but the new youthDebut clock is the source of truth after promotion.
  assert.equal(legacyYouthBaseAgeAtPromotion(18, 34), 7);
  assert.equal(ageFromCareerStart(legacyYouthBaseAgeAtPromotion(18, 34), 34), 18);
});

test('aging tick can run retirement checks without applying a second OVR decline', () => {
  const result = tickAging({
    split: 12,
    applyDecline: false,
    players: [
      { id: 'vet', nick: 'Vet', age: 34, ovr: 68, role: 'Rifler' },
      { id: 'star', nick: 'Star', age: 34, ovr: 90, role: 'AWP' },
    ],
  });

  assert.deepEqual(result.ovrDeltas, {});
  assert.deepEqual(result.newRetirees, [{ id: 'vet', nick: 'Vet', age: 34 }]);
});
