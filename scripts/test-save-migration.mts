// T6.1 — Test save migration. Roda `tsx scripts/test-save-migration.mts`.
//
// Cobertura: cria saves fake em versões antigas (v1 sem _v, v3 c/ sponsors
// legados, v7 c/ chemistry) e verifica que migrateSave os leva até
// SAVE_VERSION atual com todos os campos backfilled.
//
// Sai com exit 0 se tudo passou; exit 1 se algum assert falhou.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  migrateSave,
  saveVersion,
  SAVE_VERSION,
  stampVersion,
} from '../src/state/saveMigrations.ts';
import { legacyFromAttrs, attrsOf, type PlayerAttrs } from '../src/engine/attrs/model.ts';
import { applyAttrDelta } from '../src/engine/career/attrEvo.ts';

test('v1 legado (sem _v) é tratado como v1 e migra até SAVE_VERSION', () => {
  const legacy = { org: { name: 'Test', tag: 'TST' }, split: 1, sponsors: [] };
  assert.equal(saveVersion(legacy), 1);
  const migrated = migrateSave(legacy);
  assert.equal(saveVersion(migrated), SAVE_VERSION);
});

test('migrateSave é idempotente em save já-versionado', () => {
  const fresh = stampVersion({ org: null, sponsors: [] });
  assert.equal(saveVersion(fresh), SAVE_VERSION);
  const after = migrateSave(fresh);
  assert.equal(saveVersion(after), SAVE_VERSION);
  // Sem cambio de shape — saves já-current devem voltar idênticos
  assert.deepEqual(after, fresh);
});

test('v2 → v3 backfill: campos novos de sponsors são preenchidos', () => {
  const v2 = { _v: 2, sponsors: ['logitech'], sponsorUntil: { logitech: 3 } };
  const migrated = migrateSave(v2);
  assert.equal(saveVersion(migrated), SAVE_VERSION);
  // sponsors legados PRESERVADOS
  assert.deepEqual(migrated.sponsors, ['logitech']);
  assert.deepEqual(migrated.sponsorUntil, { logitech: 3 });
  // campos novos estampados
  assert.equal(migrated.pendingSponsorOffer, null);
  assert.deepEqual(migrated.sponsorCooldown, {});
});

test('v3 → v4 backfill: team events', () => {
  const v3 = { _v: 3, sponsors: [], sponsorUntil: {}, pendingSponsorOffer: null, sponsorCooldown: {} };
  const migrated = migrateSave(v3);
  assert.equal(migrated.pendingTeamEvent, null);
  assert.deepEqual(migrated.resolvedTeamEvents, []);
});

test('v1 sem nenhum campo de sponsors → migra com defaults seguros', () => {
  const minimal = { split: 5 };
  const migrated = migrateSave(minimal);
  assert.equal(saveVersion(migrated), SAVE_VERSION);
  assert.deepEqual(migrated.sponsors, []);
  assert.deepEqual(migrated.sponsorUntil, {});
  assert.equal(migrated.pendingSponsorOffer, null);
  assert.deepEqual(migrated.resolvedTeamEvents, []);
});

test('cascata: pula migrations intermediárias sem erro', () => {
  // Save v8 que já tinha coachStints — deve passar pela 8→9, 9→10, 10→11 e
  // chegar ao SAVE_VERSION atual sem perder coachStints existentes.
  const v8 = {
    _v: 8,
    sponsors: [],
    sponsorUntil: {},
    pendingSponsorOffer: null,
    sponsorCooldown: {},
    pendingTeamEvent: null,
    resolvedTeamEvents: [],
    pendingYearAwards: null,
    yearAwardsHistory: [],
    lastTalkAt: {},
    pairChem: {},
    coachStints: [{ coachNick: 'GOMEZ', startSplit: 1, trophies: ['Cup S1'] }],
  };
  const migrated = migrateSave(v8);
  assert.equal(saveVersion(migrated), SAVE_VERSION);
  // coachStints preservado
  assert.deepEqual(migrated.coachStints, v8.coachStints);
  // campos das migrations 8→11 estampados
  assert.deepEqual(migrated.retired, []);
  assert.deepEqual(migrated.lastRetirees, []);
  assert.equal(migrated.scrimsThisSplit, 0);
  assert.equal(migrated.hiredScoutId, null);
  assert.deepEqual(migrated.scoutReports, []);
});

// ── v26 → v27 (realismo FM): atributos gravados em todo jogador do save ──────

const snap = (id: string, role: string, n: number, age?: number) => ({
  id, nick: id.toUpperCase(), name: id, country: 'br', role, aim: n + 3, consistency: n, clutch: n - 1, awp: role === 'AWP' ? n + 4 : n - 22, igl: role === 'IGL' ? n + 5 : n - 20, ...(age ? { age } : {}),
});
const v26 = () => ({
  _v: 26,
  org: { name: 'Org', tag: 'ORG' },
  split: 7,
  squad: [
    { playerId: 'p1', fromId: 't1', playerSnapshot: snap('p1', 'AWP', 84, 22) },
    { playerId: 'p2', fromId: 't1', playerSnapshot: snap('p2', 'IGL', 78) },
    { playerId: 'p3', fromId: 't1', playerSnapshot: snap('p3', 'Entry', 80) },
    { playerId: 'p4', fromId: 't1' }, // save antigo sem snapshot: fica pro findSigning
  ],
  evo: { p1: 4, p2: -2 },
  evoAttrBias: { p1: { awp: 2 } },
  youth: { y1: snap('y1', 'Rifler', 66, 18) },
  customPlayers: { c1: snap('c1', 'Support', 70) },
  extraOnTeam: { tX: [{ player: snap('x1', 'Lurker', 74), arrival: 5 }] },
});

test('v26 → v27: snapshots, youth, custom e extraOnTeam ganham attrs com os MESMOS 5 números', () => {
  const m = migrateSave(v26()) as Record<string, any>;
  assert.equal(saveVersion(m), SAVE_VERSION);
  assert.ok(SAVE_VERSION >= 27);
  const check = (p: Record<string, any>) => {
    assert.equal(p.attrs?.v, 1, `${p.id} sem attrs`);
    const l = legacyFromAttrs(p.attrs as PlayerAttrs);
    for (const k of ['aim', 'awp', 'igl', 'clutch', 'consistency']) assert.equal(l[k as 'aim'], p[k], `${p.id}.${k}`);
  };
  for (const sig of m.squad.slice(0, 3)) check(sig.playerSnapshot);
  assert.equal(m.squad[3].playerSnapshot, undefined);
  check(m.youth.y1);
  check(m.customPlayers.c1);
  check(m.extraOnTeam.tX[0].player);
});

test('v26 → v27: evolução escalar vira evolução POR ATRIBUTO sem mudar o jogador', () => {
  const src = v26();
  const m = migrateSave(src) as Record<string, any>;
  assert.deepEqual(Object.keys(m.attrEvo).sort(), ['p1', 'p2'], 'só quem tinha evo');
  const p1 = src.squad[0].playerSnapshot!;
  const x1 = applyAttrDelta(attrsOf(p1 as never), m.attrEvo.p1);
  assert.deepEqual(legacyFromAttrs(x1), {
    aim: p1.aim + 4, awp: p1.awp + 4 + 2, igl: p1.igl + 4, clutch: p1.clutch + 4, consistency: p1.consistency + 4,
  });
  const p2 = src.squad[1].playerSnapshot!;
  const x2 = applyAttrDelta(attrsOf(p2 as never), m.attrEvo.p2);
  assert.equal(legacyFromAttrs(x2).igl, p2.igl - 2);
  // campos antigos preservados (telas e mercado ainda leem o evo escalar)
  assert.deepEqual(m.evo, src.evo);
  assert.deepEqual(m.evoAttrBias, src.evoAttrBias);
});

test('v26 → v27 é idempotente e não reescreve attrs já gravados', () => {
  const once = migrateSave(v26());
  assert.deepEqual(migrateSave(once), once);
  const pre = v26() as Record<string, any>;
  const own = { ...attrsOf(pre.squad[0].playerSnapshot), ca: 150 };
  pre.squad[0].playerSnapshot.attrs = own;
  pre.attrEvo = { p1: { aim: 1 } };
  const m = migrateSave(pre) as Record<string, any>;
  assert.equal(m.squad[0].playerSnapshot.attrs.ca, 150);
  assert.deepEqual(m.attrEvo.p1, { aim: 1 });
});

test('save v1 minimalista chega ao v27 com attrEvo vazio', () => {
  const m = migrateSave({ split: 2 }) as Record<string, any>;
  assert.equal(saveVersion(m), SAVE_VERSION);
  assert.deepEqual(m.attrEvo, {});
});
