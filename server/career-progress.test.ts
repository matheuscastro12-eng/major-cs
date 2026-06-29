import assert from 'node:assert/strict';
import test from 'node:test';
import { applyCareerVrsDecay, careerEventKey } from '../src/engine/career/progress.js';

test('career VRS decays before each event gain is applied', () => {
  assert.equal(applyCareerVrsDecay(100, 40), 100);
  assert.equal(applyCareerVrsDecay(applyCareerVrsDecay(100, 40), 20), 80);
});

test('career event keys distinguish all events in the same split', () => {
  assert.equal(careerEventKey(4, 1), '4:1');
  assert.equal(careerEventKey(4, 2), '4:2');
  assert.notEqual(careerEventKey(4, 1), careerEventKey(4, 3));
});
