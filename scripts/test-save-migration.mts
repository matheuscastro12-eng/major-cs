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
