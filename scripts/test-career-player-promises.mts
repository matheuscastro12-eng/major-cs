// PROMESSAS A JOGADORES (#10 — engine/career/playerPromises.ts). Roda via `npm run test:sim`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judgePlayerPromises, hasOpenPromise, PROMISE_DEADLINE_SPLITS, type PlayerPromise } from '../src/engine/career/playerPromises.ts';

const mk = (over: Partial<PlayerPromise>): PlayerPromise => ({
  kind: 'extension', madeAtSplit: 3, deadlineSplit: 5, status: 'open', ...over,
});

const ctx = (over: Partial<Parameters<typeof judgePlayerPromises>[1]> = {}) => ({
  split: 5,
  contractUntil: () => 6 as number | null,
  squadIds: ['a', 'b'],
  fatigue: () => 50,
  ...over,
});

test('extension: renovar (contrato estendido vs snapshot) cumpre; prazo estourado quebra', () => {
  const p = { p1: [mk({ contractUntilAt: 6 })] };
  // contrato ainda termina em 6 = NÃO renovou; no prazo (split 4) segue aberta
  const early = judgePlayerPromises(p, ctx({ split: 4 }));
  assert.equal(early.promises.p1[0].status, 'open');
  assert.equal(early.outcomes.length, 0);
  // split 5 (deadline) sem renovar = QUEBRADA
  const broke = judgePlayerPromises(p, ctx());
  assert.equal(broke.promises.p1[0].status, 'broken');
  assert.deepEqual(broke.outcomes, [{ playerId: 'p1', kind: 'extension', kept: false }]);
  // renovou (contrato agora vai até 9 > snapshot 6) = CUMPRIDA — e ANTES do prazo conta
  const kept = judgePlayerPromises(p, ctx({ split: 4, contractUntil: () => 9 }));
  assert.equal(kept.promises.p1[0].status, 'kept');
  assert.equal(kept.outcomes[0].kept, true);
});

test('signing: reforço = alguém NOVO vs snapshot do elenco', () => {
  const p = { p1: [mk({ kind: 'signing', squadIdsAt: ['a', 'b'] })] };
  assert.equal(judgePlayerPromises(p, ctx({ split: 4 })).outcomes.length, 0);          // mesmo elenco, no prazo
  const kept = judgePlayerPromises(p, ctx({ split: 4, squadIds: ['a', 'b', 'NOVO'] }));
  assert.equal(kept.outcomes[0]?.kept, true);
  const broke = judgePlayerPromises(p, ctx({ split: 5 }));                             // prazo, sem reforço
  assert.equal(broke.outcomes[0]?.kept, false);
});

test('workload: fadiga < 40 cumpre; imutabilidade e helper de aberto', () => {
  const p = { p1: [mk({ kind: 'workload' })] };
  assert.equal(judgePlayerPromises(p, ctx({ split: 4, fatigue: () => 30 })).outcomes[0]?.kept, true);
  assert.equal(judgePlayerPromises(p, ctx({ split: 5, fatigue: () => 70 })).outcomes[0]?.kept, false);
  // original intacto (imutável)
  assert.equal(p.p1[0].status, 'open');
  assert.equal(hasOpenPromise(p, 'p1', 'workload'), true);
  assert.equal(hasOpenPromise(p, 'p1', 'signing'), false);
  // promessa já julgada não re-dispara
  const once = judgePlayerPromises(p, ctx({ split: 5, fatigue: () => 70 }));
  const twice = judgePlayerPromises(once.promises, ctx({ split: 6, fatigue: () => 70 }));
  assert.equal(twice.outcomes.length, 0);
  assert.ok(PROMISE_DEADLINE_SPLITS >= 1);
});
