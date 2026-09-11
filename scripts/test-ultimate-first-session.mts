// [U05] jornada da primeira sessão: ordem, idempotência, retomada e dispensa.
import test from 'node:test';
import assert from 'node:assert/strict';
import { completeStep, dismissJourney, emptyJourney, journeyComplete, JOURNEY_STEPS, nextStep, normalizeJourney, seedFromProfile } from '../src/engine/ultimate/firstSession.ts';

test('avança em ordem e é idempotente', () => {
  let j = emptyJourney();
  assert.equal(nextStep(j), 'starter');
  j = completeStep(j, 'training');            // fora de ordem: ignorado
  assert.deepEqual(j.done, []);
  j = completeStep(j, 'starter'); j = completeStep(j, 'starter');
  assert.deepEqual(j.done, ['starter']);
  assert.equal(nextStep(j), 'strength');
  for (const s of JOURNEY_STEPS) j = completeStep(j, s);
  assert.ok(journeyComplete(j));
  assert.equal(nextStep(j), null);
});

test('refresh retoma: normalize preserva etapas válidas e descarta lixo', () => {
  const j = normalizeJourney({ v: 1, done: ['strength', 'starter', 'xpto', 'starter'], dismissed: 'no' });
  assert.deepEqual(j.done, ['starter', 'strength']);
  assert.equal(j.dismissed, false);
  assert.equal(nextStep(j), 'training');
  assert.deepEqual(normalizeJourney(null), emptyJourney());
});

test('veterano: onboarded com histórico dispensa sozinho; novo onboarded começa em strength', () => {
  const vet = seedFromProfile(emptyJourney(), true, 12);
  assert.equal(vet.dismissed, true);
  assert.equal(nextStep(vet), null);
  const novo = seedFromProfile(emptyJourney(), true, 0);
  assert.equal(nextStep(novo), 'strength');
  const guest = seedFromProfile(emptyJourney(), false, 0);
  assert.equal(nextStep(guest), 'starter');
  assert.equal(nextStep(dismissJourney(novo)), null);
});
