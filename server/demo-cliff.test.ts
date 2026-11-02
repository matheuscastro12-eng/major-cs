// Segunda chance do cliffhanger da demo do Road to Pro (engine/rtp/demoCliff.ts).
// Engine puro (sem React): importa direto. O resto do cliffhanger é coberto em
// scripts/test-rtp-demo-cliff.mts (npm run test:sim).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRtpSave } from '../src/engine/rtp/createSave.ts';
import {
  DEMO_WEEKS, CLIFF_TTL_MS, REARM_AFTER_MS, MAX_CLIFF_ROUNDS,
  ensureDemoCliff, openDemoCliff, expireDemoCliff, rearmDemoCliff, activeDemoCliff, deliverDemoCliff,
} from '../src/engine/rtp/demoCliff.ts';
import type { RoadToProSave } from '../src/engine/rtp/types.ts';

const T0 = 1_700_000_000_000;

function expiredSave(seed = 4242): RoadToProSave {
  const s = createRtpSave({
    nick: 'cliff', country: 'br', role: 'Rifler',
    personality: 'resilient', archetype: 'allrounder', age: 17,
    categoryPoints: { mechanical: 4, mental: 4, physical: 4 }, seed,
  });
  const atGate = ensureDemoCliff({ ...s, world: { ...s.world, week: DEMO_WEEKS + 1 } });
  const opened = openDemoCliff(atGate, T0);
  return expireDemoCliff(opened, T0 + CLIFF_TTL_MS);
}

test('demo-cliff: expirar grava expiredAt', () => {
  const s = expiredSave();
  assert.equal(s.demoCliff?.status, 'expired');
  assert.equal(s.demoCliff?.expiredAt, T0 + CLIFF_TTL_MS);
  assert.equal(activeDemoCliff(s, T0 + CLIFF_TTL_MS), null);
});

test('demo-cliff: re-arm antes de 3 dias não muda o save', () => {
  const s = expiredSave();
  const expiredAt = s.demoCliff!.expiredAt!;
  assert.equal(rearmDemoCliff(s, expiredAt), s);
  assert.equal(rearmDemoCliff(s, expiredAt + REARM_AFTER_MS - 1), s);
});

test('demo-cliff: re-arm depois de 3 dias gera a rodada 2 (teaser, oferta menor, relógio zerado)', () => {
  const s = expiredSave();
  const first = s.demoCliff!.offer;
  const now = s.demoCliff!.expiredAt! + REARM_AFTER_MS;
  const r = rearmDemoCliff(s, now);
  const c = r.demoCliff!;
  assert.equal(c.status, 'teaser');
  assert.equal(c.round, 2);
  assert.equal(c.openedAt, undefined);
  assert.equal(c.expiresAt, undefined);
  assert.notEqual(c.offer.id, first.id);
  assert.ok(c.offer.wage < first.wage, 'salário revisado não caiu');
  assert.ok(c.offer.signingBonus < first.signingBonus, 'luvas revisadas não caíram');
  assert.equal(c.offer.wage, Math.round(first.wage * 0.85));
  // volta a ser uma proposta viva: a trava reabre as 48h e quem compra a recebe na mesa
  assert.ok(activeDemoCliff(r, now));
  const opened = openDemoCliff(r, now);
  assert.equal(opened.demoCliff?.expiresAt, now + CLIFF_TTL_MS);
  const delivered = deliverDemoCliff(opened, now + 1);
  assert.equal(delivered.demoCliff?.status, 'delivered');
  assert.deepEqual(delivered.world.pendingOffers?.map((o) => o.id), [c.offer.id]);
});

test('demo-cliff: rodada 2 expirada não re-arma (MAX_CLIFF_ROUNDS)', () => {
  const s = expiredSave();
  const t1 = s.demoCliff!.expiredAt! + REARM_AFTER_MS;
  const r2 = openDemoCliff(rearmDemoCliff(s, t1), t1);
  const dead = expireDemoCliff(r2, t1 + CLIFF_TTL_MS);
  assert.equal(dead.demoCliff?.round, MAX_CLIFF_ROUNDS);
  assert.equal(dead.demoCliff?.status, 'expired');
  assert.equal(rearmDemoCliff(dead, t1 + CLIFF_TTL_MS + 30 * REARM_AFTER_MS), dead);
});

test('demo-cliff: save expirado antes desta versão (sem expiredAt) re-arma pelo expiresAt', () => {
  const s = expiredSave();
  const legacy: RoadToProSave = { ...s, demoCliff: { ...s.demoCliff!, expiredAt: undefined } };
  assert.equal(rearmDemoCliff(legacy, s.demoCliff!.expiresAt! + REARM_AFTER_MS - 1), legacy);
  assert.equal(rearmDemoCliff(legacy, s.demoCliff!.expiresAt! + REARM_AFTER_MS).demoCliff?.round, 2);
});

test('demo-cliff: sem cliffhanger ou ainda viva → no-op', () => {
  const s = expiredSave();
  const noCliff: RoadToProSave = { ...s, demoCliff: undefined };
  assert.equal(rearmDemoCliff(noCliff, T0 * 2), noCliff);
  const alive = openDemoCliff(ensureDemoCliff({ ...s, demoCliff: undefined }), T0);
  assert.equal(rearmDemoCliff(alive, T0 + 10 * REARM_AFTER_MS), alive);
});
