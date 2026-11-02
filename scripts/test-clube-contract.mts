// Contrato da fase 3 (engine/clube): migração v29 e linha de base neutra.
import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateClube } from '../src/engine/clube/clubeMigration.ts';

test('v29 grava clube, converte o contracts antigo e é idempotente', () => {
  const s = migrateClube({ contracts: { a: 5, b: 7 }, squad: [{ playerId: 'a' }, { playerId: 'b' }] });
  assert.equal(s.clube?.v, 1);
  assert.equal(s.clube!.contracts.a.until, 5);
  assert.equal(s.clube!.dressing.lineup, null, 'sem escalação salva, o motor usa os 5 do elenco como hoje');
  assert.deepEqual(migrateClube(s), s);
});
