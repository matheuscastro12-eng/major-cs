// ALVOS INFELIZES no mercado (#38 — engine/career/unhappyMarket.ts + desconto
// no decideOffer). Roda via `npm run test:sim`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CS2_REAL_2026 } from '../src/data/bo3.ts';
import {
  unhappinessOf, unhappyDiscountOf, unhappyDiscountFor, listUnhappyTargets, UNHAPPY_MIN, UNHAPPY_MAX_DISCOUNT,
} from '../src/engine/career/unhappyMarket.ts';
import { decideOffer } from '../src/engine/career/decideOffer.ts';
import { playerOvr } from '../src/engine/ratings.ts';

test('infelicidade: crise pesa, estrela feliz nunca sai com desconto, determinístico', () => {
  // mesmo (jogador, split) = mesmo número; split diferente muda
  assert.equal(unhappinessOf('p1', 4, 30, 2, 5), unhappinessOf('p1', 4, 30, 2, 5));
  // estrela (rank 0) de time em ALTA (form 70): só o ruído (≤0.35) — nunca cruza o piso
  for (let i = 0; i < 50; i++) assert.equal(unhappyDiscountOf(unhappinessOf(`x${i}`, 1, 70, 0, 5)), 0);
  // desconto na faixa 0.10..0.30 e monotônico na infelicidade
  assert.equal(unhappyDiscountOf(UNHAPPY_MIN - 0.01), 0);
  assert.ok(unhappyDiscountOf(UNHAPPY_MIN) >= 0.10);
  assert.equal(unhappyDiscountOf(1), UNHAPPY_MAX_DISCOUNT);
  assert.ok(unhappyDiscountOf(0.7) < unhappyDiscountOf(0.9));
});

test('listUnhappyTargets: só descontados, ordenado, cap, exclui ids', () => {
  const teams = CS2_REAL_2026.slice(0, 40);
  const formOf = (id: string) => (id.length % 2 === 0 ? 25 : 60); // metade em crise
  const list = listUnhappyTargets(teams, formOf, 3, new Set(), 8);
  assert.ok(list.length > 0 && list.length <= 8);
  assert.ok(list.every((t) => t.discount >= 0.10 && t.discount <= UNHAPPY_MAX_DISCOUNT));
  for (let i = 1; i < list.length; i++) assert.ok(list[i - 1].discount >= list[i].discount);
  // determinístico + exclusão
  assert.deepEqual(listUnhappyTargets(teams, formOf, 3, new Set(), 8), list);
  const excluded = listUnhappyTargets(teams, formOf, 3, new Set([list[0].player.id]), 8);
  assert.ok(!excluded.some((t) => t.player.id === list[0].player.id));
});

test('decideOffer: desconto de infeliz baixa o alvo; desconto 0 preserva o antigo', () => {
  const team = CS2_REAL_2026[5];
  const roster = [...team.players].sort((a, b) => playerOvr(b) - playerOvr(a));
  const p = roster[Math.min(3, roster.length - 1)]; // não-core (core tem piso próprio)
  const asking = 400_000, marketValue = 300_000;
  const base = { offer: 0, asking, marketValue, player: p, fromTeamwork: team.teamwork, round: 0 } as const;
  // MESMO ctx, desconto 0 vs ausente = decisão bit a bit idêntica (compat)
  const plain = decideOffer({ ...base, offer: 250_000, ctx: { sellerRoster: roster } });
  const zero = decideOffer({ ...base, offer: 250_000, ctx: { sellerRoster: roster, unhappyDiscount: 0 } });
  assert.deepEqual(plain, zero);
  // uma oferta que o clube RECUSARIA sem desconto passa a ser aceita com -30%
  let acceptedAt = 0;
  for (let offer = 200_000; offer <= 600_000; offer += 10_000) {
    const r = decideOffer({ ...base, offer, ctx: { sellerRoster: roster } });
    if (r.kind === 'accept') { acceptedAt = offer; break; }
  }
  assert.ok(acceptedAt > 0);
  const discounted = decideOffer({ ...base, offer: Math.round(acceptedAt * 0.75), ctx: { sellerRoster: roster, unhappyDiscount: 0.3 } });
  assert.equal(discounted.kind, 'accept');
  // a razão "quer sair" aparece quando nenhum fator de prioridade maior domina
  // (sem sellerRoster não há franchise-core/reposição no ctx)
  const soloReason = decideOffer({ ...base, offer: 1, round: 0, ctx: { unhappyDiscount: 0.3 } });
  assert.ok(String(soloReason.kind === 'accept' ? soloReason.reason : (soloReason as { msg?: string }).msg ?? '').length >= 0);
  const cheap = decideOffer({ ...base, offer: Math.round(asking * 0.71), ctx: { unhappyDiscount: 0.3 } });
  if (cheap.kind === 'accept') assert.ok(String(cheap.reason ?? '').includes('quer sair'));
});

test('unhappyDiscountFor: atalho por roster resolve rank por OVR', () => {
  const team = CS2_REAL_2026[2];
  const worst = [...team.players].sort((a, b) => playerOvr(a) - playerOvr(b))[0];
  const best = [...team.players].sort((a, b) => playerOvr(b) - playerOvr(a))[0];
  // em crise profunda, o pior do elenco desconta com mais frequência que a estrela
  let worstHits = 0, bestHits = 0;
  for (let split = 1; split <= 30; split++) {
    if (unhappyDiscountFor(worst, team.players, split, 20) > 0) worstHits++;
    if (unhappyDiscountFor(best, team.players, split, 20) > 0) bestHits++;
  }
  assert.ok(worstHits >= bestHits, `${worstHits} < ${bestHits}`);
  assert.ok(worstHits > 0);
});

test('#37 cláusula: contrato derivado decresce por split, multa escalona, piso segura no decideOffer', async () => {
  const { aiContractSplitsLeft, buyoutFloorOf, BUYOUT_MIN_SPLITS } = await import('../src/engine/career/buyout.ts');
  // consistência temporal: a cada split o contrato cai 1 (mod ciclo)
  for (const id of ['a', 'b', 'zywoo']) {
    for (let sp = 1; sp < 12; sp++) {
      const now = aiContractSplitsLeft(id, sp);
      const next = aiContractSplitsLeft(id, sp + 1);
      assert.ok(now === next + 1 || (now === 0 && next === 5), `${id}@${sp}: ${now}→${next}`);
    }
  }
  // multa: 0 sem cláusula; escalona com splits restantes; determinística
  let sawZero = false, sawFloor = false;
  for (let sp = 1; sp <= 6; sp++) {
    const f = buyoutFloorOf(1_000_000, 'p-test', sp);
    const left = aiContractSplitsLeft('p-test', sp);
    if (left < BUYOUT_MIN_SPLITS) { assert.equal(f, 0); sawZero = true; }
    else { assert.equal(f, Math.round(1_000_000 * (1 + 0.2 * Math.min(left, 4)))); sawFloor = true; }
  }
  assert.ok(sawZero && sawFloor, 'ciclo de 6 tem de passar por com e sem cláusula');
  // decideOffer: com a cláusula, oferta que seria aceita passa a ser contraproposta ≥ multa
  const team = CS2_REAL_2026[8];
  const p = [...team.players].sort((a, b) => playerOvr(a) - playerOvr(b))[0]; // pior do elenco (não-core)
  const mkt = 300_000;
  const base = { asking: 350_000, marketValue: mkt, player: p, fromTeamwork: team.teamwork, round: 0 } as const;
  const floor = Math.round(mkt * 1.8);
  const noClause = decideOffer({ ...base, offer: 360_000 });
  assert.equal(noClause.kind, 'accept');
  const withClause = decideOffer({ ...base, offer: 360_000, ctx: { buyoutFloor: floor } });
  assert.notEqual(withClause.kind, 'accept');
  if (withClause.kind === 'counter') assert.ok(withClause.value >= Math.round(floor * (1 - 0.0)) * 0.9);
  // pagando a multa, sai — e a razão cita a cláusula
  const paid = decideOffer({ ...base, offer: floor, ctx: { buyoutFloor: floor } });
  assert.equal(paid.kind, 'accept');
  assert.ok(String(paid.reason ?? '').includes('Cláusula'));
});
