// Contrato da fase 4 (engine/mundo): migração v30 e linha de base neutra.
import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateMundo } from '../src/engine/mundo/mundoMigration.ts';

test('v30 grava mundo e é idempotente; sem circuito novo, calendário vazio = circuito atual', () => {
  const s = migrateMundo({ squad: [] });
  assert.equal(s.mundo?.v, 1);
  assert.equal(s.mundo!.databaseId, null);
  assert.deepEqual(migrateMundo(s), s);
});
