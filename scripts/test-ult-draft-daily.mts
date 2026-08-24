// DRAFT DO DIA (Ultimate) — contrato da seed global diária.
// Fixa: seed determinística por data (e diferente entre dias), opções do draft
// idênticas pra mesma seed (o "mesmo draft pra todo mundo"), flag `daily` no
// run e compatibilidade do save antigo (campo opcional). Roda via `npm run test:sim`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailyDraftSeed, draftOptions, DRAFT_ROLES, DRAFT_ENTRY } from '../src/engine/ultimate/draft.ts';
import { draftStart, defaultUltimateState } from '../src/engine/ultimate/state.ts';
import { buildCatalog } from '../src/engine/ultimate/cards.ts';
import { CS2_REAL_2026 } from '../src/data/bo3.ts';

const catalog = buildCatalog(CS2_REAL_2026.filter((t) => t.id !== '__free__'));

function richState() {
  const s = defaultUltimateState();
  return { ...s, profile: { ...s.profile, credits: DRAFT_ENTRY * 3 } };
}

test('dailyDraftSeed: determinística por data, muda entre dias, nunca 0', () => {
  assert.equal(dailyDraftSeed('2026-08-17'), dailyDraftSeed('2026-08-17'));
  assert.notEqual(dailyDraftSeed('2026-08-17'), dailyDraftSeed('2026-08-18'));
  for (let d = 1; d <= 28; d++) {
    const seed = dailyDraftSeed(`2026-09-${String(d).padStart(2, '0')}`);
    assert.ok(seed > 0 && Number.isInteger(seed));
  }
});

test('mesma seed → MESMAS opções em todos os estágios (o draft global)', () => {
  const seed = dailyDraftSeed('2026-08-17');
  for (let stage = 0; stage < DRAFT_ROLES.length; stage++) {
    const a = draftOptions(catalog, seed, stage, []);
    const b = draftOptions(catalog, seed, stage, []);
    assert.deepEqual(a.map((c) => c.key), b.map((c) => c.key), `estágio ${stage} idêntico`);
    assert.equal(a.length, 5);
  }
  // dia diferente → draft diferente (ao menos em algum estágio)
  const other = dailyDraftSeed('2026-08-18');
  const diff = Array.from({ length: DRAFT_ROLES.length }, (_, st) =>
    JSON.stringify(draftOptions(catalog, seed, st, []).map((c) => c.key)) !==
    JSON.stringify(draftOptions(catalog, other, st, []).map((c) => c.key)));
  assert.ok(diff.some(Boolean), 'dias diferentes não podem oferecer o mesmo draft inteiro');
});

test('draftStart: marca a run como daily e preserva o default (não-daily)', () => {
  const daily = draftStart(richState(), '2026-08-17', dailyDraftSeed('2026-08-17'), true);
  assert.ok(daily.ok);
  assert.equal(daily.state.profile.draft.daily, true);
  assert.equal(daily.state.profile.draft.seed, dailyDraftSeed('2026-08-17'));

  const livre = draftStart(richState(), '2026-08-17', 12345);
  assert.ok(livre.ok);
  assert.equal(livre.state.profile.draft.daily, false);
});

test('save antigo sem o campo daily continua válido (campo opcional)', () => {
  const s = richState();
  // simula run persistida por versão anterior (sem `daily`)
  const legacy = { ...s.profile.draft };
  delete (legacy as Record<string, unknown>).daily;
  const st = { ...s, profile: { ...s.profile, draft: legacy } };
  assert.equal(st.profile.draft.daily, undefined);
  const r = draftStart(st, '2026-08-17', 99, true);
  assert.ok(r.ok, 'draftStart aceita estado legado');
});
