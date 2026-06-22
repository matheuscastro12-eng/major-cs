import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAcademyPlayerId, parseRegenPlayerId, partitionResolvable } from '../src/engine/career/signings.js';

test('parses a retired AI replacement player from its stable ID', () => {
  assert.deepEqual(parseRegenPlayerId('bo3_123~rg4.2.37.18'), {
    teamId: 'bo3_123',
    slot: 4,
    generation: 2,
    debut: 37,
    ageAtDebut: 18,
  });
  assert.equal(parseRegenPlayerId('bo3_123'), null);
});

test('parses deterministic academy players, including free agents', () => {
  assert.deepEqual(parseAcademyPlayerId('__free____aca12'), { teamId: '__free__', index: 12 });
  assert.deepEqual(parseAcademyPlayerId('bo3_99__aca3'), { teamId: 'bo3_99', index: 3 });
  assert.equal(parseAcademyPlayerId('prospect__abc'), null);
});

test('unresolvable legacy signings release their roster slots', () => {
  const signings = [{ id: 'known' }, { id: 'removed' }, { id: 'known-2' }];
  const partition = partitionResolvable(signings, (signing) => signing.id.startsWith('known'));
  assert.deepEqual(partition.resolved.map((signing) => signing.id), ['known', 'known-2']);
  assert.deepEqual(partition.unresolved.map((signing) => signing.id), ['removed']);
});
