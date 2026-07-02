import assert from 'node:assert/strict';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { encodeCloudPayload, hashCloudPayload } from '../src/state/cloudCodec';
import {
  CloudSavePayloadError,
  decodeCloudSavePayload,
  MAX_CLOUD_SAVE_BYTES,
} from './cloud-save-codec';

function careerLikeSave(): string {
  return JSON.stringify({
    org: { name: 'Road to Major', tag: 'RTM', colors: ['#d4af37', '#111111'] },
    split: 42,
    squad: Array.from({ length: 5 }, (_, index) => ({
      playerId: `player-${index}`,
      fromId: 'team-origin',
      stats: Array.from({ length: 120 }, (_, round) => ({
        round,
        map: ['mirage', 'inferno', 'nuke'][round % 3],
        kills: 18 + (round % 8),
        deaths: 12 + (round % 5),
      })),
    })),
    history: Array.from({ length: 80 }, (_, split) => ({
      split,
      circuit: 'Circuito Regional',
      position: (split % 8) + 1,
      wins: 5,
      losses: 2,
    })),
  });
}

test('cloud transport compresses losslessly and keeps the database payload unchanged', async () => {
  const original = careerLikeSave();
  const wire = await encodeCloudPayload(original);

  assert.equal(wire.encoding, 'gzip-base64');
  assert.ok(wire.data.length < original.length * 0.35);

  const restored = decodeCloudSavePayload(wire.data, wire.encoding, wire.originalBytes);
  assert.equal(restored, original);
});

test('small and legacy payloads keep working without compression', async () => {
  const original = JSON.stringify({ split: 1, squad: [] });
  assert.deepEqual(await encodeCloudPayload(original), { data: original });
  assert.equal(decodeCloudSavePayload(original, undefined, undefined), original);
  assert.equal(decodeCloudSavePayload('', undefined, undefined), '');
});

test('hash is stable and changes with the snapshot', async () => {
  const first = await hashCloudPayload('{"split":1}');
  const repeated = await hashCloudPayload('{"split":1}');
  const changed = await hashCloudPayload('{"split":2}');

  assert.ok(first);
  assert.equal(first, repeated);
  assert.notEqual(first, changed);
});

test('compressed payload rejects corruption and decompressed saves over the limit', () => {
  assert.throws(
    () => decodeCloudSavePayload('not-base64', 'gzip-base64', 100),
    CloudSavePayloadError,
  );

  const oversized = JSON.stringify({ data: 'x'.repeat(MAX_CLOUD_SAVE_BYTES) });
  const compressed = gzipSync(oversized).toString('base64');
  assert.throws(
    () => decodeCloudSavePayload(compressed, 'gzip-base64', Buffer.byteLength(oversized)),
    CloudSavePayloadError,
  );
});
