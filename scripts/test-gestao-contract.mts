// Contrato da fase 2 (engine/gestao): migração v28 e linha de base neutra.
import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateGestao } from '../src/engine/gestao/gestaoMigration.ts';
import { staffEffects } from '../src/engine/gestao/staff.ts';
import { NEUTRAL_TACTIC_MODS } from '../src/engine/gestao/tatica.ts';

test('v28 grava gestao com condição para cada jogador do elenco e é idempotente', () => {
  const s = migrateGestao({ squad: [{ playerId: 'a' }, { playerId: 'b' }] });
  assert.equal(s.gestao?.v, 1);
  assert.deepEqual(Object.keys(s.gestao!.condition).sort(), ['a', 'b']);
  assert.equal(s.gestao!.training.week.length, 7);
  assert.deepEqual(migrateGestao(s), s);
});

test('sem comissão e sem tática, a linha de base é neutra (o jogo não muda)', () => {
  const e = staffEffects(null);
  for (const v of Object.values(e.training)) assert.equal(v, 1);
  assert.equal(e.familiarityGain, 1);
  assert.equal(NEUTRAL_TACTIC_MODS.teamLogit, 0);
});
