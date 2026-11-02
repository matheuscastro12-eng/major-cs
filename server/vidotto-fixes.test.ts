// [UT-MKT403] + [RTP-RAF]: regressões do relato de 02/11 (mercado e treinos RTP)
import assert from 'node:assert/strict';
import test from 'node:test';
import { commonFail } from '../src/state/ultimateMarket';
import { diffLerp, tierDifficulty } from '../src/engine/rtp/minigames';
import type { Tier } from '../src/engine/rtp/types';

test('mercado: 403 not_owner NÃO vira "unpaid" (conta paga via aviso de vitalícia)', () => {
  assert.equal(commonFail(403, { error: 'not_owner' }), null);
  assert.equal(commonFail(403, { error: 'origem não permitida' }), 'unpaid');
  assert.equal(commonFail(403), 'unpaid');
  assert.equal(commonFail(401, { error: 'not_owner' }), 'unpaid');
  assert.equal(commonFail(500), 'offline');
  assert.equal(commonFail(400, { error: 'x' }), null);
});

test('treinos RTP: dificuldade nunca é NaN (tier ausente/desconhecido)', () => {
  assert.equal(tierDifficulty(undefined as unknown as Tier), 0);
  assert.equal(tierDifficulty('major' as unknown as Tier), 0);
  assert.ok(Number.isFinite(diffLerp(4200, 3500, NaN)));
  assert.equal(diffLerp(4200, 3500, NaN), 4200);
  assert.equal(diffLerp(10, 20, 0.5), 15);
});
