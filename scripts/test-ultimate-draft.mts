// Ultimate DRAFT — testes do engine + reducers. Roda via `npm run test:sim`.
//
// Cobertura:
//   - draftOptions: 5 opções, determinístico por (seed, stage), sem repetir
//     jogador (entre opções E contra picks), role compatível, capitão premium
//   - draftStart: debita a inscrição, recusa sem credits / run ativo
//   - draftPick: registra e avança; idempotente contra double-click
//   - draftRecord: vitória avança; derrota/4 vitórias encerram e CREDITAM a
//     linha certa da tabela; run inativo não paga (advanced=false)
//   - migrateUltimate: backfill de draft em save antigo + preserva ativo

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DRAFT_ENTRY, DRAFT_OPTIONS, DRAFT_REWARDS, DRAFT_ROLES, DRAFT_TARGET,
  draftOptions, draftOppTarget,
} from '../src/engine/ultimate/draft.ts';
import { buildCatalog } from '../src/engine/ultimate/cards.ts';
import { rarityInfo } from '../src/engine/ultimate/rarities.ts';
import { roleFitsSlot } from '../src/engine/ultimate/chemistry.ts';
import {
  defaultUltimateState, migrateUltimate, draftStart, draftPick, draftRecord,
} from '../src/engine/ultimate/state.ts';
import { CS2_REAL_2026 } from '../src/data/bo3.ts';

const catalog = buildCatalog(CS2_REAL_2026.filter((t) => t.id !== '__free__'));

test('draftOptions: 5 opções válidas, determinísticas, sem repetição', () => {
  for (let stage = 0; stage < DRAFT_ROLES.length; stage++) {
    const a = draftOptions(catalog, 12345, stage, []);
    const b = draftOptions(catalog, 12345, stage, []);
    assert.equal(a.length, DRAFT_OPTIONS, `stage ${stage}: ${a.length} opções`);
    assert.deepEqual(a.map((c) => c.key), b.map((c) => c.key)); // determinístico
    const ids = new Set(a.map((c) => c.playerId));
    assert.equal(ids.size, a.length, `stage ${stage}: jogador repetido`);
    for (const c of a) assert.ok(roleFitsSlot(c.role, DRAFT_ROLES[stage]), `${c.nick} (${c.role}) não encaixa em ${DRAFT_ROLES[stage]}`);
  }
  // seed diferente → opções diferentes (quase certamente)
  const s1 = draftOptions(catalog, 111, 1, []).map((c) => c.key).join(',');
  const s2 = draftOptions(catalog, 222, 1, []).map((c) => c.key).join(',');
  assert.notEqual(s1, s2);
});

test('draftOptions: capitão vem do pool premium e picks são excluídos', () => {
  const captains = draftOptions(catalog, 999, 0, []);
  for (const c of captains) assert.ok(rarityInfo(c.rarity).tier >= 5, `capitão ${c.nick} é ${c.rarity} (tier baixo)`);
  const picked = captains[0].playerId;
  const next = draftOptions(catalog, 999, 1, [picked]);
  assert.ok(next.every((c) => c.playerId !== picked), 'jogador já escolhido reapareceu');
});

test('draftStart: debita inscrição; recusa sem credits e com run ativo', () => {
  const base = defaultUltimateState();
  const rich = { ...base, profile: { ...base.profile, credits: DRAFT_ENTRY + 500 } };
  const r = draftStart(rich, '2026-07-23', 42);
  assert.ok(r.ok);
  assert.equal(r.state.profile.credits, 500);
  assert.ok(r.state.profile.draft.active);
  assert.equal(r.state.profile.draft.runs, 1);
  // run ativo → recusa (sem debitar de novo)
  const again = draftStart(r.state, '2026-07-23', 43);
  assert.ok(!again.ok);
  assert.equal(again.state.profile.credits, 500);
  // sem credits → recusa
  const poor = { ...base, profile: { ...base.profile, credits: DRAFT_ENTRY - 1 } };
  assert.ok(!draftStart(poor, '2026-07-23', 42).ok);
});

test('draftPick: avança estágio e é idempotente', () => {
  const base = defaultUltimateState();
  let s = draftStart({ ...base, profile: { ...base.profile, credits: DRAFT_ENTRY } }, 'd', 7).state;
  s = draftPick(s, 'p1:gold');
  assert.equal(s.profile.draft.stage, 1);
  const dbl = draftPick(s, 'p1:gold'); // double-click da MESMA carta
  assert.equal(dbl.profile.draft.stage, 1);
  for (const k of ['p2:gold', 'p3:gold', 'p4:gold', 'p5:gold']) s = draftPick(s, k);
  assert.equal(s.profile.draft.stage, 5);
  assert.equal(s.profile.draft.picks.length, 5);
  const extra = draftPick(s, 'p6:gold'); // estágio cheio → no-op
  assert.equal(extra.profile.draft.picks.length, 5);
});

test('draftRecord: run completo credita a linha certa; derrota encerra', () => {
  const mkActive = () => {
    const base = defaultUltimateState();
    return draftStart({ ...base, profile: { ...base.profile, credits: DRAFT_ENTRY } }, 'd', 7).state;
  };
  // campanha perfeita: 4 vitórias → recompensa do índice DRAFT_TARGET
  let s = mkActive();
  for (let i = 0; i < DRAFT_TARGET; i++) {
    const r = draftRecord(s, true);
    s = r.state;
    assert.ok(r.advanced);
    if (i < DRAFT_TARGET - 1) { assert.ok(!r.over); assert.equal(r.credits, 0); }
    else {
      assert.ok(r.completed && r.over);
      assert.equal(r.credits, DRAFT_REWARDS[DRAFT_TARGET].credits);
      assert.equal(r.rewardCard, DRAFT_REWARDS[DRAFT_TARGET].card);
    }
  }
  assert.equal(s.profile.credits, DRAFT_REWARDS[DRAFT_TARGET].credits); // 0 após inscrição + prêmio
  assert.equal(s.profile.draft.best, DRAFT_TARGET);
  assert.ok(!s.profile.draft.active);
  // 2 vitórias + derrota → linha [2]
  let s2 = mkActive();
  s2 = draftRecord(s2, true).state;
  s2 = draftRecord(s2, true).state;
  const out = draftRecord(s2, false);
  assert.ok(out.over && !out.completed);
  assert.equal(out.credits, DRAFT_REWARDS[2].credits);
  // run inativo → advanced=false e nada pago
  const dead = draftRecord(out.state, true);
  assert.ok(!dead.advanced);
  assert.equal(dead.credits, 0);
});

test('draftOppTarget escala com vitórias e respeita o teto', () => {
  assert.equal(draftOppTarget(80, 0), 80);
  assert.ok(draftOppTarget(80, 3) > draftOppTarget(80, 1));
  assert.equal(draftOppTarget(99, 4), 97); // teto
});

test('migrateUltimate: backfill de draft + preserva run ativo', () => {
  const fresh = migrateUltimate({ profile: { credits: 10 } });
  assert.deepEqual(fresh.profile.draft, defaultUltimateState().profile.draft);
  const active = migrateUltimate({ profile: { draft: { date: 'd', seed: 9, stage: 3, picks: ['a', 'b', 'c'], wins: 1, active: true, best: 2, runs: 4 } } });
  assert.equal(active.profile.draft.stage, 3);
  assert.ok(active.profile.draft.active);
  assert.deepEqual(active.profile.draft.picks, ['a', 'b', 'c']);
});
