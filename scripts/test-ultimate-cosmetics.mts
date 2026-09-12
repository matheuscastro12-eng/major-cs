// [U10] cosméticos e coleções: catálogo íntegro, progresso por posse atual, prêmio idempotente.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildServerCatalog } from '../server/ultimate-pack.ts';
import { COLLECTIONS, FRAMES, collectionKey, evaluateCollections, frameById, mergeFrames, normalizeClub } from '../src/engine/ultimate/cosmetics.ts';
import { migrateUltimate, defaultUltimateState } from '../src/engine/ultimate/state.ts';

const catalog = buildServerCatalog(new Date('2026-09-12T12:00:00Z'));

test('catálogo de molduras: ids únicos e toda moldura de coleção existe', () => {
  assert.equal(new Set(FRAMES.map((f) => f.id)).size, FRAMES.length);
  for (const c of COLLECTIONS) if (c.reward.frame) assert.ok(frameById(c.reward.frame), `${c.id} → ${c.reward.frame}`);
  assert.deepEqual(mergeFrames(['lenda-de-era'], ['rookie', 'xpto', 'rookie']), ['rookie', 'lenda-de-era']);
});

test('coleções: progresso por playerId DISTINTO e posse atual; claimed vem do objectivesClaimed', () => {
  const br = catalog.filter((c) => c.country === 'br');
  const one = br[0];
  const dup = [one, one, one, one, one];                // 5 cópias da mesma carta = 1
  assert.equal(evaluateCollections(dup, []).find((p) => p.def.id === 'br-five')!.have, 1);
  const five = br.filter((c, i, a) => a.findIndex((x) => x.playerId === c.playerId) === i).slice(0, 5);
  const p = evaluateCollections(five, []).find((x) => x.def.id === 'br-five')!;
  assert.equal(p.done, five.length >= 5);
  const claimed = evaluateCollections(five, [collectionKey('br-five')]).find((x) => x.def.id === 'br-five')!;
  assert.equal(claimed.claimed, true);
  assert.equal(evaluateCollections([], [])[0].have, 0);
});

test('perfil: campos de clube/molduras são opcionais com default e sobrevivem ao migrate', () => {
  const base = defaultUltimateState();
  const m = migrateUltimate(JSON.parse(JSON.stringify({ ...base, profile: { ...base.profile, club: { name: '  Furacão CS  ', logo: null }, frames: ['rookie', 'lixo'], equippedFrame: 'rookie' } })));
  assert.deepEqual(m.profile.club, { name: 'Furacão CS', logo: null });
  assert.deepEqual(m.profile.frames, ['rookie']);
  assert.equal(m.profile.equippedFrame, 'rookie');
  const old = migrateUltimate(JSON.parse(JSON.stringify(base)));
  assert.equal(old.profile.club ?? null, null);
  assert.deepEqual(old.profile.frames ?? [], []);
  assert.equal(normalizeClub({ name: '', logo: null }), null);
});
