import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pixResumeValid } from '../src/state/pixResume.ts';

const DAY = 24 * 60 * 60 * 1000;

test('registro dentro dos 7 dias vale', () => {
  const now = 10 * DAY;
  assert.deepEqual(pixResumeValid({ src: 'landing', at: now - DAY }, now), { src: 'landing', at: now - DAY });
});
test('registro além de 7 dias não vale', () => {
  const now = 10 * DAY;
  assert.equal(pixResumeValid({ src: 'landing', at: now - 8 * DAY }, now), null);
});
test('registro no futuro (relógio voltou) não vale', () => {
  assert.equal(pixResumeValid({ src: 'landing', at: 10 * DAY }, 5 * DAY), null);
});
test('malformado ou ausente não vale', () => {
  assert.equal(pixResumeValid(null, Date.now()), null);
  assert.equal(pixResumeValid({}, Date.now()), null);
  assert.equal(pixResumeValid({ src: 123, at: Date.now() } as never, Date.now()), null);
  assert.equal(pixResumeValid({ src: 'landing', at: 'ontem' } as never, Date.now()), null);
});
