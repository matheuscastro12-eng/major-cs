// T6.1 — Test sponsor engine. Roda `tsx scripts/test-sponsor-engine.mts`.
//
// Cobertura:
//   - tryGenerateOffer respeita pendingSponsorOffer (não gera 2x)
//   - acceptOffer adiciona ao array + estampa sponsorUntil
//   - cooldown pós-recusa impede re-oferta no próximo split
//   - cleanupExpired remove contratos vencidos
//   - placementBonusTotal soma corretamente para todos os tiers

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/engine/rng.ts';
import {
  tryGenerateOffer,
  acceptOffer,
  rejectOffer,
  cleanupExpired,
  placementBonusTotal,
  type SponsorState,
} from '../src/engine/sponsors.ts';

const freshState = (): SponsorState => ({
  sponsors: [],
  sponsorUntil: {},
  pendingSponsorOffer: null,
  sponsorCooldown: {},
});

test('tryGenerateOffer não gera se já há offer pending', () => {
  const s = freshState();
  s.pendingSponsorOffer = { id: 'x', sponsorId: 'logitech', splitOffered: 1 };
  const rng = makeRng(42);
  const offer = tryGenerateOffer(s, { split: 1, vrs: 0 }, rng);
  assert.equal(offer, null);
});

test('tryGenerateOffer não gera se slots cheios', () => {
  const s = freshState();
  s.sponsors = ['logitech', 'hyperx', 'razer'];
  const rng = makeRng(42);
  const offer = tryGenerateOffer(s, { split: 1, vrs: 0, maxSlots: 3 }, rng);
  assert.equal(offer, null);
});

test('acceptOffer adiciona ao array E estampa sponsorUntil', () => {
  const s = freshState();
  const offer = { id: 'o1', sponsorId: 'logitech', splitOffered: 1 };
  acceptOffer(s, offer, 1);
  assert.ok(s.sponsors.includes('logitech'));
  // term de logitech é 2 splits → sponsorUntil = 1 + 2 - 1 = 2
  assert.equal(s.sponsorUntil.logitech, 2);
  assert.equal(s.pendingSponsorOffer, null);
});

test('rejectOffer estampa cooldown sem adicionar ao array', () => {
  const s = freshState();
  const offer = { id: 'o1', sponsorId: 'logitech', splitOffered: 1 };
  rejectOffer(s, offer, 1);
  assert.equal(s.sponsors.length, 0);
  // cooldown 2 splits → não pode re-oferecer antes do split 3
  assert.equal(s.sponsorCooldown?.logitech, 3);
});

test('cleanupExpired remove sponsors com contrato vencido', () => {
  const s = freshState();
  s.sponsors = ['logitech', 'hyperx', 'razer'];
  s.sponsorUntil = { logitech: 5, hyperx: 2, razer: 1 };
  // No split 3, logitech ainda vale (até 5) mas hyperx (2) e razer (1) já venceram
  const removed = cleanupExpired(s, 3);
  assert.deepEqual(removed.sort(), ['hyperx', 'razer']);
  assert.deepEqual(s.sponsors, ['logitech']);
  assert.equal(s.sponsorUntil.hyperx, undefined);
  assert.equal(s.sponsorUntil.razer, undefined);
});

test('placementBonusTotal soma todos os sponsors ativos no Major', () => {
  const s = freshState();
  s.sponsors = ['logitech', 'hyperx'];
  s.sponsorUntil = { logitech: 5, hyperx: 5 };
  // Major = 2× perSplit cada (200k + 280k = 480k → 960k)
  const total = placementBonusTotal(s, 3, 'major');
  assert.equal(total, 960_000);
});

test('placementBonusTotal ignora sponsors expirados', () => {
  const s = freshState();
  s.sponsors = ['logitech', 'hyperx'];
  s.sponsorUntil = { logitech: 5, hyperx: 1 }; // hyperx vencido no split 3
  const total = placementBonusTotal(s, 3, 'major');
  // só logitech: 200k × 2 = 400k
  assert.equal(total, 400_000);
});

test('seed estável: mesma seed sempre gera mesma cadeia de offers', () => {
  const s1 = freshState();
  const s2 = freshState();
  const rng1 = makeRng(123);
  const rng2 = makeRng(123);
  const out1: (string | null)[] = [];
  const out2: (string | null)[] = [];
  for (let split = 1; split <= 10; split++) {
    const o1 = tryGenerateOffer(s1, { split, vrs: 100, clubeTier: 2 }, rng1);
    const o2 = tryGenerateOffer(s2, { split, vrs: 100, clubeTier: 2 }, rng2);
    out1.push(o1?.sponsorId ?? null);
    out2.push(o2?.sponsorId ?? null);
  }
  assert.deepEqual(out1, out2);
});
