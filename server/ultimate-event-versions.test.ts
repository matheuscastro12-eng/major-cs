// [CSM-2] Versões de evento por jogador: regras puras + DRIFT cliente×servidor.
// O cliente monta o catálogo com buildFullCatalog (engine vivo); o servidor usa
// o snapshot materializado. Durante um evento, a declaração (quais jogadores), o
// pool de abertura e o roll com a mesma seed têm de ser IDÊNTICOS nos dois.
import assert from 'node:assert/strict';
import test from 'node:test';
import { CS2_REAL_2026 } from '../src/data/bo3.js';
import { buildFullCatalog } from '../src/engine/ultimate/catalog.js';
import { catalogIndex } from '../src/engine/ultimate/cards.js';
import {
  activeEventVersionDecl, applyEventVersions, EVENT_VERSION_BOOST, EVENT_VERSION_SIZE, eventVersionKey, parseEventVersionKey,
} from '../src/engine/ultimate/eventVersions.js';
import { openingPool } from '../src/engine/ultimate/packPool.js';
import { packById, rollPack } from '../src/engine/ultimate/packs.js';
import { monthIndex } from '../src/engine/ultimate/promos.js';
import { makeRng } from '../src/engine/rng.js';
import { buildServerCatalog, serverCardByKeyAnyMonth, serverCatalogIndex, serverSquadLookup } from './ultimate-pack.js';
import { dropPool, rollDropOffers } from '../src/engine/ultimate/drops.js';

const FRIDAY = new Date('2026-07-03T12:00:00Z');   // sexta: fim de semana ISO 27 aberto
const TUESDAY = new Date('2026-07-07T12:00:00Z');  // terça: sem evento

test('chave de versão de evento: ida e volta', () => {
  const k = eventVersionKey('bo3_1', 'wknd-2026-27');
  assert.equal(k, 'bo3_1:evento@wknd-2026-27');
  assert.deepEqual(parseEventVersionKey(k), { playerId: 'bo3_1', eventId: 'wknd-2026-27' });
  assert.equal(parseEventVersionKey('bo3_1:gold'), null);
});

test('fora do fim de semana não há declaração e o pool não muda', () => {
  const cat = buildServerCatalog(TUESDAY);
  assert.equal(activeEventVersionDecl(TUESDAY.getTime(), cat), null);
  assert.equal(openingPool(cat, 'bronze', TUESDAY), cat);
});

test('durante o evento: 5 jogadores, base substituída na MESMA vaga de raridade, +OVR e rótulo', () => {
  const cat = buildServerCatalog(FRIDAY);
  const decl = activeEventVersionDecl(FRIDAY.getTime(), cat)!;
  assert.ok(decl);
  assert.equal(decl.eventId, 'wknd-2026-27');
  assert.equal(decl.playerIds.length, EVENT_VERSION_SIZE);
  const pool = openingPool(cat, 'bronze', FRIDAY)!;
  assert.equal(pool.length, cat.length, 'substitui, não adiciona');
  for (const pid of decl.playerIds) {
    const base = cat.find((c) => c.playerId === pid && (c.rarity === 'rareGold' || c.rarity === 'elite'))!;
    assert.ok(!pool.some((c) => c.key === base.key), 'base sai do pool');
    const ev = pool.find((c) => c.key === eventVersionKey(pid, decl.eventId))!;
    assert.ok(ev, 'versão de evento entra');
    assert.equal(ev.rarity, 'evento');
    assert.equal(ev.poolRarity, base.rarity);
    assert.equal(ev.ovr, Math.min(99, base.ovr + EVENT_VERSION_BOOST));
    assert.equal(ev.eventLabel, decl.label);
  }
});

test('DRIFT: declaração, pool e roll idênticos no cliente (engine) e no servidor (snapshot)', () => {
  const client = buildFullCatalog(CS2_REAL_2026, monthIndex(FRIDAY)).catalog;
  const server = buildServerCatalog(FRIDAY);
  const dc = activeEventVersionDecl(FRIDAY.getTime(), client);
  const ds = activeEventVersionDecl(FRIDAY.getTime(), server);
  assert.deepEqual(dc, ds);
  for (const packId of ['bronze', 'silver', 'gold', 'premium']) {
    const pc = openingPool(client, packId, FRIDAY)!;
    const ps = openingPool(server, packId, FRIDAY)!;
    assert.deepEqual(pc.map((c) => c.key), ps.map((c) => c.key), `pool ${packId}`);
    const pack = packById(packId)!;
    for (const seed of [1, 42, 9999, 123456]) {
      assert.deepEqual(rollPack(pc, pack, makeRng(seed)).map((c) => c.key), rollPack(ps, pack, makeRng(seed)).map((c) => c.key));
    }
  }
  // drop: mesmo pool e mesmas 3 opções
  for (const seed of [7, 77, 777]) {
    const oc = rollDropOffers(seed, dropPool(applyEventVersions(client, dc)), 0).offers.map((c) => c.key);
    const os = rollDropOffers(seed, dropPool(applyEventVersions(server, ds)), 0).offers.map((c) => c.key);
    assert.deepEqual(oc, os);
  }
});

test('carta de evento resolve no cliente e no servidor depois do evento (coleção não perde carta)', () => {
  const server = buildServerCatalog(FRIDAY);
  const decl = activeEventVersionDecl(FRIDAY.getTime(), server)!;
  const key = eventVersionKey(decl.playerIds[0], decl.eventId);
  const clientIdx = catalogIndex(buildFullCatalog(CS2_REAL_2026, monthIndex(TUESDAY)).catalog);
  const c1 = clientIdx.get(key);
  const c2 = serverCatalogIndex(TUESDAY).get(key);
  assert.ok(c1 && c2);
  assert.equal(c1.ovr, c2.ovr);
  assert.equal(c1.rarity, 'evento');
  assert.equal(c2.special, true);
  assert.ok(serverSquadLookup(TUESDAY)(key));
  assert.equal(serverCardByKeyAnyMonth(key)?.key, key, 'import/any-month também resolve a versão');
});
